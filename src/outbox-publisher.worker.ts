import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { OutboxPublisherModule } from './outbox-publisher.module.js';
import { OutboxPublisherService } from './infrastructure/database/messaging/outbox-publisher.service.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('OutboxPublisherWorker');

  const app = await NestFactory.createApplicationContext(
    OutboxPublisherModule,
  );

  app.enableShutdownHooks();

  const publisher = app.get(OutboxPublisherService);

  try {
    await publisher.start();
  } catch (error) {
    logger.error(
      'Falha fatal no Outbox Publisher',
      error instanceof Error ? error.stack : String(error),
    );

    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();