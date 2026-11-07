
import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import {
  ChangeMessageVisibilityCommand,
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';

import { ApplicationError } from '../../../application/errors/application-error.js';
import { WalletApplicationService } from '../../../application/wallet-application.service.js';
import { WagerTransactionKind } from '../../../domain/wager-transaction/wager-transaction.js';
import { requestContext } from '../../logging/request-context.js';

interface WagerTransactionEnvelope {
  messageId: string;
  correlationId?: string;
  type: 'WagerTransactionRequested';
  occurredAt: string;
  data: {
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: {
      amount: string;
      currency: string;
    };
    referenceExternalTransactionId?: string;
  };
}

class PermanentMessageError extends Error {}

@Injectable()
export class WagerTransactionConsumerService {
  private readonly logger = new Logger(WagerTransactionConsumerService.name);
  private readonly client: SQSClient;

  private readonly consumerName =
    process.env.SQS_CONSUMER_NAME ?? 'wager-transaction-consumer';

  private readonly queueName =
    process.env.SQS_TRANSACTIONS_QUEUE_NAME ??
    'wager-transactions.fifo';

  private readonly dlqName =
    process.env.SQS_TRANSACTIONS_DLQ_NAME ??
    'wager-transactions-dlq.fifo';

  private readonly maxReceiveCount = Math.max(
    1,
    Number(process.env.SQS_MAX_RECEIVE_COUNT ?? 5),
  );

  private readonly visibilityTimeout = Math.min(
    43200,
    Math.max(1, Number(process.env.SQS_VISIBILITY_TIMEOUT ?? 60)),
  );

  private readonly waitTimeSeconds = Math.min(
    20,
    Math.max(0, Number(process.env.SQS_WAIT_TIME_SECONDS ?? 20)),
  );

  private queueUrl = '';
  private dlqUrl = '';
  private stopping = false;

  constructor(
    private readonly walletService: WalletApplicationService,
  ) {
    this.client = new SQSClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: process.env.SQS_ENDPOINT_URL || undefined,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      },
    });
  }

  async start(): Promise<void> {
    await this.ensureQueues();

    this.logger.log(`Consumidor iniciado: ${this.queueName}`);

    try {
      while (!this.stopping) {
        try {
          const response = await this.client.send(
            new ReceiveMessageCommand({
              QueueUrl: this.queueUrl,
              MaxNumberOfMessages: 1,
              WaitTimeSeconds: this.waitTimeSeconds,
              VisibilityTimeout: this.visibilityTimeout,
              MessageSystemAttributeNames: [
                'ApproximateReceiveCount',
                'MessageGroupId',
              ],
            }),
          );

          const message = response.Messages?.[0];

          if (!message) {
            continue;
          }

          if (this.stopping) {
            await this.returnMessage(message);
            break;
          }

          await this.processMessage(message);
        } catch (error) {
          if (this.stopping) {
            break;
          }

          this.logger.error(
            'Falha no ciclo de consumo SQS',
            error instanceof Error ? error.stack : String(error),
          );

          await this.sleep(3000);
        }
      }
    } finally {
      this.client.destroy();
      this.logger.log('Consumidor finalizado.');
    }
  }

  stop(): void {
    this.stopping = true;
    this.logger.log('Solicitado encerramento do consumidor.');
  }

  private async ensureQueues(): Promise<void> {
    this.dlqUrl = await this.getOrCreateQueue(this.dlqName, {
      FifoQueue: 'true',
      ContentBasedDeduplication: 'true',
    });

    const dlqAttributes = await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: this.dlqUrl,
        AttributeNames: ['QueueArn'],
      }),
    );

    const dlqArn = dlqAttributes.Attributes?.QueueArn;

    if (!dlqArn) {
      throw new Error('Não foi possível obter o ARN da DLQ.');
    }

    this.queueUrl = await this.getOrCreateQueue(this.queueName, {
      FifoQueue: 'true',
      ContentBasedDeduplication: 'true',
    });

    await this.client.send(
      new SetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        Attributes: {
          VisibilityTimeout: String(this.visibilityTimeout),
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: this.maxReceiveCount,
          }),
        },
      }),
    );

    this.logger.log('Filas FIFO e política de redrive configuradas.');
  }

  private async getOrCreateQueue(
    queueName: string,
    attributes: Record<string, string>,
  ): Promise<string> {
    try {
      const existing = await this.client.send(
        new GetQueueUrlCommand({ QueueName: queueName }),
      );

      if (existing.QueueUrl) {
        return existing.QueueUrl;
      }
    } catch {
      this.logger.log(`Criando fila ${queueName}.`);
    }

    const created = await this.client.send(
      new CreateQueueCommand({
        QueueName: queueName,
        Attributes: attributes,
      }),
    );

    if (!created.QueueUrl) {
      throw new Error(`Não foi possível criar a fila ${queueName}.`);
    }

    return created.QueueUrl;
  }

  private async processMessage(message: Message): Promise<void> {
    if (!message.Body || !message.ReceiptHandle) {
      this.logger.error('Mensagem SQS sem Body ou ReceiptHandle.');
      return;
    }

    let envelope: WagerTransactionEnvelope;

    try {
      envelope = this.parseEnvelope(message.Body);
    } catch (error) {
      await this.handleProcessingError(message, error);
      return;
    }

    const correlationId =
      envelope.correlationId ?? envelope.messageId;

    const payloadHash = createHash('sha256')
      .update(message.Body)
      .digest('hex');

    await requestContext.run({ correlationId }, async () => {
      try {
        const result = await this.walletService.processWagerFromMessage(
          {
            providerId: envelope.data.providerId,
            externalTransactionId: envelope.data.externalTransactionId,
            idempotencyKey: envelope.data.idempotencyKey,
            playerId: envelope.data.playerId,
            walletId: envelope.data.walletId,
            roundId: envelope.data.roundId,
            gameId: envelope.data.gameId,
            kind: envelope.data.kind,
            amount: envelope.data.money.amount,
            currency: envelope.data.money.currency,
            referenceExternalTransactionId:
              envelope.data.referenceExternalTransactionId,
          },
          {
            consumerName: this.consumerName,
            messageId: envelope.messageId,
            payloadHash,
          },
        );

        this.logger.log(
          JSON.stringify({
            event: 'sqs.message.processed',
            consumerName: this.consumerName,
            messageId: envelope.messageId,
            correlationId,
            walletId: envelope.data.walletId,
            providerId: envelope.data.providerId,
            externalTransactionId:
              envelope.data.externalTransactionId,
            status: result.status,
          }),
        );

        await this.acknowledge(message.ReceiptHandle!);
      } catch (error) {
        await this.handleProcessingError(message, error);
      }
    });
  }

  private parseEnvelope(body: string): WagerTransactionEnvelope {
    let value: unknown;

    try {
      value = JSON.parse(body);
    } catch {
      throw new PermanentMessageError('JSON inválido.');
    }

    if (!value || typeof value !== 'object') {
      throw new PermanentMessageError('Envelope inválido.');
    }

    const envelope = value as Record<string, unknown>;
    const data = envelope.data as Record<string, unknown> | undefined;
    const money = data?.money as Record<string, unknown> | undefined;

    const requiredStrings = [
      envelope.messageId,
      envelope.occurredAt,
      data?.providerId,
      data?.externalTransactionId,
      data?.idempotencyKey,
      data?.playerId,
      data?.walletId,
      data?.roundId,
      data?.gameId,
      money?.amount,
      money?.currency,
    ];

    if (
      envelope.type !== 'WagerTransactionRequested' ||
      requiredStrings.some(
        (field) => typeof field !== 'string' || !field.trim(),
      ) ||
      !data ||
      !money ||
      !Object.values(WagerTransactionKind).includes(
        data.kind as WagerTransactionKind,
      ) ||
      Number.isNaN(Date.parse(envelope.occurredAt as string))
    ) {
      throw new PermanentMessageError(
        'Envelope de transação inválido.',
      );
    }

    if (
      envelope.correlationId !== undefined &&
      (typeof envelope.correlationId !== 'string' ||
        !/^[a-zA-Z0-9._:-]{1,128}$/.test(envelope.correlationId))
    ) {
      throw new PermanentMessageError(
        'Correlation ID inválido.',
      );
    }

    if (
      data.referenceExternalTransactionId !== undefined &&
      (typeof data.referenceExternalTransactionId !== 'string' ||
        !data.referenceExternalTransactionId.trim())
    ) {
      throw new PermanentMessageError(
        'Referência externa inválida.',
      );
    }

    return envelope as unknown as WagerTransactionEnvelope;
  }

  private async handleProcessingError(
    message: Message,
    error: unknown,
  ): Promise<void> {
    const receiptHandle = message.ReceiptHandle;

    if (!receiptHandle) {
      return;
    }

    const correlationId =
      requestContext.getStore()?.correlationId ?? null;

    const errorMessage =
      error instanceof Error ? error.message : String(error);

    const code =
      error instanceof ApplicationError ? error.code : undefined;

    if (
      error instanceof PermanentMessageError ||
      code === 'INBOX_MESSAGE_PAYLOAD_CONFLICT' ||
      (code?.startsWith('INVALID_') ?? false) ||
      code === 'OPENING_TRANSACTION_NOT_ALLOWED'
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'sqs.message.rejected',
          correlationId,
          messageId: message.MessageId ?? null,
          reason: errorMessage,
        }),
      );

      await this.moveToDlq(message);
      return;
    }

    if (
      error instanceof ApplicationError &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'sqs.message.terminal_error',
          correlationId,
          messageId: message.MessageId ?? null,
          code,
        }),
      );

      await this.acknowledge(receiptHandle);
      return;
    }

    const receiveCount = Number(
      message.Attributes?.ApproximateReceiveCount ?? 1,
    );

    if (receiveCount >= this.maxReceiveCount) {
      this.logger.error(
        JSON.stringify({
          event: 'sqs.message.max_attempts_exceeded',
          correlationId,
          messageId: message.MessageId ?? null,
          receiveCount,
        }),
      );

      await this.moveToDlq(message);
      return;
    }

    const delaySeconds = Math.min(
      300,
      2 ** Math.min(receiveCount, 8),
    );

    this.logger.warn(
      JSON.stringify({
        event: 'sqs.message.retry_scheduled',
        correlationId,
        messageId: message.MessageId ?? null,
        receiveCount,
        maxReceiveCount: this.maxReceiveCount,
        delaySeconds,
        error: errorMessage,
      }),
    );

    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: delaySeconds,
      }),
    );
  }

  private async moveToDlq(message: Message): Promise<void> {
    if (!message.Body || !message.ReceiptHandle) {
      return;
    }

    const deduplicationId = createHash('sha256')
      .update(message.Body)
      .digest('hex');

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.dlqUrl,
        MessageBody: message.Body,
        MessageGroupId:
          message.Attributes?.MessageGroupId ?? 'invalid-message',
        MessageDeduplicationId: deduplicationId,
      }),
    );

    await this.acknowledge(message.ReceiptHandle);
  }

  private async acknowledge(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  private async returnMessage(message: Message): Promise<void> {
    if (!message.ReceiptHandle) {
      return;
    }

    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: 0,
      }),
    );
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
