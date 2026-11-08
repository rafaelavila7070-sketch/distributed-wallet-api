
import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

@Controller()
export class AppController {
  constructor(private readonly em: EntityManager) {}

  // Endpoint original: mantém a compatibilidade com a API.
  @Get()
  async getHealth() {
    try {
      await this.em.getConnection().execute('SELECT 1');

      return {
        status: 'ok',
        service: 'distributed-wallet-api',
        database: 'connected',
      };
    } catch {
      return {
        status: 'error',
        service: 'distributed-wallet-api',
        database: 'disconnected',
      };
    }
  }

  // Liveness: verifica somente se a aplicação está ativa.
  @Get('health/live')
  getLiveness() {
    return {
      status: 'ok',
      service: 'distributed-wallet-api',
    };
  }

  // Readiness: verifica se a aplicação pode receber requisições.
  @Get('health/ready')
  async getReadiness() {
    try {
      await this.em.getConnection().execute('SELECT 1');

      return {
        status: 'ok',
        service: 'distributed-wallet-api',
        database: 'connected',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'distributed-wallet-api',
        database: 'disconnected',
      });
    }
  }
}
