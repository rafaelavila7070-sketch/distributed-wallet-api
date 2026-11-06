
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { SqsConsumerModule } from './sqs-consumer.module.js';
import { WagerTransactionConsumerService } from './infrastructure/messaging/sqs/wager-transaction-consumer.service.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('SqsConsumerWorker');

  const app = await NestFactory.createApplicationContext(
    SqsConsumerModule,
  );

  const consumer = app.get(WagerTransactionConsumerService);

  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;

    shuttingDown = true;
    consumer.stop();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    await consumer.start();
  } catch (error) {
    logger.error(
      'Falha fatal no SQS Consumer',
      error instanceof Error ? error.stack : String(error),
    );

    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
