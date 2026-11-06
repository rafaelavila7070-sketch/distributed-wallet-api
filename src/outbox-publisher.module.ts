import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { mikroOrmConfig } from './mikro-orm.config.js';
import { OutboxPublisherService } from './infrastructure/database/messaging/outbox-publisher.service.js';

@Module({
  imports: [MikroOrmModule.forRoot(mikroOrmConfig)],
  providers: [OutboxPublisherService],
})
export class OutboxPublisherModule {}