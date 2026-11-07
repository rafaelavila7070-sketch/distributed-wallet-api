import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  NestMiddleware,
} from '@nestjs/common';

import type { NextFunction, Request, Response } from 'express';

import { requestContext } from './request-context.js';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HttpLoggerMiddleware.name);

  use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const startedAt = Date.now();

    const incomingCorrelationId = request.header('x-correlation-id');

    const correlationId =
      incomingCorrelationId &&
      /^[a-zA-Z0-9._:-]{1,128}$/.test(incomingCorrelationId)
        ? incomingCorrelationId
        : randomUUID();

    response.setHeader('x-correlation-id', correlationId);

    requestContext.run({ correlationId }, () => {
      response.on('finish', () => {
        const log = {
          timestamp: new Date().toISOString(),
          correlationId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        };

        const message = JSON.stringify(log);

        if (response.statusCode >= 500) {
          this.logger.error(message);
          return;
        }

        if (response.statusCode >= 400) {
          this.logger.warn(message);
          return;
        }

        this.logger.log(message);
      });

      next();
    });
  }
}