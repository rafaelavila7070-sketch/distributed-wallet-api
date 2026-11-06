
import { EntityManager } from '@mikro-orm/postgresql';

import {
  CreateOutboxEvent,
  OutboxEventRepository,
} from '../../../application/ports/outbox-event-repository.js';

import { OutboxEventEntity } from '../entities/outbox-event.entity.js';

export class MikroOrmOutboxEventRepository
  implements OutboxEventRepository
{
  constructor(private readonly em: EntityManager) {}

  async save(event: CreateOutboxEvent): Promise<void> {
    const entity = this.em.create(OutboxEventEntity, {
      eventId: event.eventId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: event.createdAt,
      attempts: 0,
      nextAttemptAt: new Date(),
    });

    this.em.persist(entity);
  }
}
