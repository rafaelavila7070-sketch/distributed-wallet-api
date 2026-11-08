
import { randomUUID } from 'node:crypto';

import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

import { EntityManager } from '@mikro-orm/postgresql';

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';

interface OutboxEventRow {
  id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date | string;
  attempts: number;
}

@Injectable()
export class OutboxPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);

  private readonly sqs: SQSClient;
  private readonly publisherId = randomUUID();

  private readonly queueName =
    process.env.SQS_EVENTS_QUEUE_NAME ?? 'wager-events';

  private queueUrl: string | undefined;
  private stopping = false;

  private readonly batchSize = 10;
  private readonly leaseSeconds = 120;

  constructor(
  private readonly em: EntityManager,
  @Optional() sqsClient?: SQSClient,
) {
  if (sqsClient) {
    this.sqs = sqsClient;
    return;
  }

  const endpoint = process.env.SQS_ENDPOINT_URL;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  this.sqs = new SQSClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        }
      : {}),
  });
}

  async start(): Promise<void> {
    await this.ensureQueue();

    this.logger.log(
      JSON.stringify({
        event: 'outbox.publisher.started',
        publisherId: this.publisherId,
        queueName: this.queueName,
      }),
    );

    while (!this.stopping) {
      try {
        const published = await this.publishPendingEvents();

        if (published === 0) {
          await this.sleep(1000);
        }
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            event: 'outbox.publisher.cycle_failed',
            publisherId: this.publisherId,
            error: this.getErrorMessage(error),
          }),
        );

        await this.sleep(3000);
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'outbox.publisher.stopped',
        publisherId: this.publisherId,
      }),
    );
  }

  async publishPendingEvents(): Promise<number> {
    const events = await this.claimPendingEvents();

    if (events.length === 0) {
      return 0;
    }

    await Promise.all(
      events.map((event) => this.publishEvent(event)),
    );

    return events.length;
  }

  private async ensureQueue(): Promise<void> {
    try {
      const response = await this.sqs.send(
        new GetQueueUrlCommand({
          QueueName: this.queueName,
        }),
      );

      this.queueUrl = response.QueueUrl;
    } catch {
      const response = await this.sqs.send(
        new CreateQueueCommand({
          QueueName: this.queueName,
        }),
      );

      this.queueUrl = response.QueueUrl;
    }

    if (!this.queueUrl) {
      throw new Error(
        `Não foi possível obter a URL da fila ${this.queueName}`,
      );
    }

    this.logger.log(
      JSON.stringify({
        event: 'outbox.publisher.queue_ready',
        queueName: this.queueName,
      }),
    );
  }

  private async claimPendingEvents(): Promise<OutboxEventRow[]> {
    const sql = `
      with candidates as (
        select id
        from outbox_events
        where published_at is null
          and next_attempt_at <= now()
          and (
            locked_until is null
            or locked_until < now()
          )
        order by created_at asc
        for update skip locked
        limit ?
      )
      update outbox_events as event
      set
        locked_until = now() + (? * interval '1 second'),
        locked_by = ?
      from candidates
      where event.id = candidates.id
      returning
        event.id,
        event.event_id,
        event.event_type,
        event.payload,
        event.created_at,
        event.attempts;
    `;

    return this.em
      .getConnection()
      .execute<OutboxEventRow[]>(sql, [
        this.batchSize,
        this.leaseSeconds,
        this.publisherId,
      ]);
  }

  private async publishEvent(event: OutboxEventRow): Promise<void> {
    const payload = event.payload;

    const correlationId =
      typeof payload.correlationId === 'string'
        ? payload.correlationId
        : null;

    const transactionId =
      typeof payload.transactionId === 'string'
        ? payload.transactionId
        : null;

    const walletId =
      typeof payload.walletId === 'string'
        ? payload.walletId
        : null;

    const providerId =
      typeof payload.providerId === 'string'
        ? payload.providerId
        : null;

    try {
      if (!this.queueUrl) {
        throw new Error('URL da fila SQS não configurada.');
      }

      const message = {
        eventId: event.event_id,
        type: event.event_type,
        occurredAt: new Date(event.created_at).toISOString(),
        data: payload,
      };

      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(message),
        }),
      );

      await this.markAsPublished(event.id);

      this.logger.log(
        JSON.stringify({
          event: 'outbox.event.published',
          publisherId: this.publisherId,
          eventId: event.event_id,
          eventType: event.event_type,
          correlationId,
          transactionId,
          walletId,
          providerId,
        }),
      );
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      this.logger.error(
        JSON.stringify({
          event: 'outbox.event.publish_failed',
          publisherId: this.publisherId,
          eventId: event.event_id,
          eventType: event.event_type,
          correlationId,
          transactionId,
          walletId,
          providerId,
          error: errorMessage,
        }),
      );

      try {
        await this.scheduleRetry(event, errorMessage);
      } catch (retryError) {
        this.logger.error(
          JSON.stringify({
            event: 'outbox.event.retry_schedule_failed',
            publisherId: this.publisherId,
            eventId: event.event_id,
            error: this.getErrorMessage(retryError),
          }),
        );
      }
    }
  }

  private async markAsPublished(eventId: string): Promise<void> {
    const sql = `
      update outbox_events
      set
        published_at = now(),
        locked_until = null,
        locked_by = null,
        last_error = null
      where id = ?
        and locked_by = ?
        and published_at is null;
    `;

    await this.em.getConnection().execute(sql, [
      eventId,
      this.publisherId,
    ]);
  }

  private async scheduleRetry(
    event: OutboxEventRow,
    errorMessage: string,
  ): Promise<void> {
    const nextAttempt = event.attempts + 1;

    const delaySeconds = Math.min(
      300,
      2 ** Math.min(event.attempts, 8),
    );

    const sql = `
      update outbox_events
      set
        attempts = attempts + 1,
        next_attempt_at = now() + (? * interval '1 second'),
        last_error = ?,
        locked_until = null,
        locked_by = null
      where id = ?
        and locked_by = ?
        and published_at is null;
    `;

    await this.em.getConnection().execute(sql, [
      delaySeconds,
      errorMessage.slice(0, 2000),
      event.id,
      this.publisherId,
    ]);

    this.logger.warn(
      JSON.stringify({
        event: 'outbox.event.retry_scheduled',
        publisherId: this.publisherId,
        eventId: event.event_id,
        attempt: nextAttempt,
        delaySeconds,
        error: errorMessage,
      }),
    );
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  onModuleDestroy(): void {
    this.stopping = true;
    this.sqs.destroy();
  }
}
