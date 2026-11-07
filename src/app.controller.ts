import { Controller, Get } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

@Controller()
export class AppController {
  constructor(private readonly em: EntityManager) {}

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
}