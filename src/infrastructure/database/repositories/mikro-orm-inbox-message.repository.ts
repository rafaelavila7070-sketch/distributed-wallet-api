import { randomUUID } from 'node:crypto';

import { EntityManager } from '@mikro-orm/postgresql';

import {
  InboxMessageRepository,
  InboxRegistrationResult,
  RegisterInboxMessage,
} from '../../../application/ports/inbox-message-repository.js';

interface InboxMessageRow {
  payload_hash: string;
}

interface InsertedInboxMessageRow {
  id: string;
}

export class MikroOrmInboxMessageRepository
  implements InboxMessageRepository
{
  constructor(private readonly em: EntityManager) {}

  async register(
    message: RegisterInboxMessage,
  ): Promise<InboxRegistrationResult> {
    const insertSql = `
      insert into inbox_messages (
        id,
        consumer_name,
        message_id,
        payload_hash,
        received_at
      )
      values (?, ?, ?, ?, ?)
      on conflict (consumer_name, message_id) do nothing
      returning id;
    `;

    const inserted = await this.em
      .getConnection()
      .execute<InsertedInboxMessageRow[]>(insertSql, [
        randomUUID(),
        message.consumerName,
        message.messageId,
        message.payloadHash,
        message.receivedAt ?? new Date(),
      ]);

    if (inserted.length > 0) {
      return 'REGISTERED';
    }

    const selectSql = `
      select payload_hash
      from inbox_messages
      where consumer_name = ?
        and message_id = ?
      limit 1;
    `;

    const existing = await this.em
      .getConnection()
      .execute<InboxMessageRow[]>(selectSql, [
        message.consumerName,
        message.messageId,
      ]);

    if (existing.length === 0) {
      throw new Error(
        'Não foi possível localizar a mensagem após conflito na Inbox.',
      );
    }

    return existing[0].payload_hash === message.payloadHash
      ? 'DUPLICATE'
      : 'PAYLOAD_CONFLICT';
  }

  async markProcessed(
    consumerName: string,
    messageId: string,
    processedAt: Date = new Date(),
  ): Promise<void> {
    const sql = `
      update inbox_messages
      set processed_at = ?
      where consumer_name = ?
        and message_id = ?
        and processed_at is null
      returning id;
    `;

    const updated = await this.em
      .getConnection()
      .execute<InsertedInboxMessageRow[]>(sql, [
        processedAt,
        consumerName,
        messageId,
      ]);

    if (updated.length === 0) {
      throw new Error(
        'Não foi possível marcar a mensagem como processada na Inbox.',
      );
    }
  }
}