import {
  Injectable,
  Logger,
  NestMiddleware,
} from '@nestjs/common';

import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HttpLoggerMiddleware.name);

  use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const startedAt = Date.now();

    response.on('finish', () => {
      const duration = Date.now() - startedAt;

      const log = {
        timestamp: new Date().toISOString(),
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: duration,
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
  }
}