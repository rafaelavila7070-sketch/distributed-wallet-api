import { Migration } from '@mikro-orm/migrations';

export class Migration20261106030000 extends Migration {
  override name = 'Migration20261106030000';

  override up(): void | Promise<void> {
    this.addSql(`
      create table "outbox_events" (
        "id" uuid not null,
        "event_id" varchar(255) not null,
        "aggregate_type" varchar(100) not null,
        "aggregate_id" uuid not null,
        "event_type" varchar(150) not null,
        "payload" jsonb not null,
        "created_at" timestamptz not null,
        "published_at" timestamptz null,
        "attempts" integer not null default 0,
        "last_error" text null,
        constraint "outbox_events_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create unique index "outbox_events_event_id_unique"
      on "outbox_events" ("event_id");
    `);

    this.addSql(`
      create index "outbox_events_unpublished_idx"
      on "outbox_events" ("created_at")
      where "published_at" is null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "outbox_events" cascade;`);
  }
}