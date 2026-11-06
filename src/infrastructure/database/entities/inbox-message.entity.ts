import { randomUUID } from 'node:crypto';

import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'inbox_messages' })
@Unique({
  name: 'inbox_messages_consumer_message_unique',
  properties: ['consumerName', 'messageId'],
})
export class InboxMessageEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({
    fieldName: 'consumer_name',
    type: 'varchar',
    length: 100,
  })
  consumerName!: string;

  @Property({
    fieldName: 'message_id',
    type: 'varchar',
    length: 255,
  })
  messageId!: string;

  @Property({
    fieldName: 'payload_hash',
    type: 'varchar',
    length: 128,
  })
  payloadHash!: string;

  @Property({
    fieldName: 'received_at',
    type: 'timestamptz',
    defaultRaw: 'now()',
  })
  receivedAt: Date = new Date();

  @Property({
    fieldName: 'processed_at',
    type: 'timestamptz',
    nullable: true,
  })
  processedAt: Date | null = null;
}