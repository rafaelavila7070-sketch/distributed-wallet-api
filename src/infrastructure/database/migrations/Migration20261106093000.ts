import { Migration } from '@mikro-orm/migrations';

export class Migration20261106093000 extends Migration {
  override name = 'Migration20261106093000';

  override up(): void | Promise<void> {
    this.addSql(`
      create table "inbox_messages" (
        "id" uuid not null,
        "consumer_name" varchar(100) not null,
        "message_id" varchar(255) not null,
        "payload_hash" varchar(128) not null,
        "received_at" timestamptz not null default now(),

        constraint "inbox_messages_pkey"
          primary key ("id"),

        constraint "inbox_messages_consumer_message_unique"
          unique ("consumer_name", "message_id")
      );
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      drop table if exists "inbox_messages";
    `);
  }
}