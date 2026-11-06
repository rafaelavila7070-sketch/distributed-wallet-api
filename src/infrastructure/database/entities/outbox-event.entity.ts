import { randomUUID } from 'node:crypto';

import {
  Entity,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'outbox_events' })
export class OutboxEventEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({
    fieldName: 'event_id',
    type: 'varchar',
    length: 255,
    unique: true,
  })
  eventId!: string;

  @Property({
    fieldName: 'aggregate_type',
    type: 'varchar',
    length: 100,
  })
  aggregateType!: string;

  @Property({
    fieldName: 'aggregate_id',
    type: 'uuid',
  })
  aggregateId!: string;

  @Property({
    fieldName: 'event_type',
    type: 'varchar',
    length: 150,
  })
  eventType!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Property({
    fieldName: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @Property({
    fieldName: 'published_at',
    type: 'timestamptz',
    nullable: true,
  })
  publishedAt: Date | null = null;

  @Property({
    type: 'integer',
    default: 0,
  })
  attempts = 0;

  @Property({
    fieldName: 'last_error',
    type: 'text',
    nullable: true,
  })
  lastError: string | null = null;

  @Property({
    fieldName: 'next_attempt_at',
    type: 'timestamptz',
    defaultRaw: 'now()',
  })
  nextAttemptAt: Date = new Date();

  @Property({
    fieldName: 'locked_until',
    type: 'timestamptz',
    nullable: true,
  })
  lockedUntil: Date | null = null;

  @Property({
    fieldName: 'locked_by',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  lockedBy: string | null = null;
}