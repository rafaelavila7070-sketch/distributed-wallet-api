import { Migration } from '@mikro-orm/migrations';

export class Migration20261106040000 extends Migration {
  override name = 'Migration20261106040000';

  override up(): void | Promise<void> {
    this.addSql(`
      alter table "outbox_events"
      add column "next_attempt_at" timestamptz not null default now(),
      add column "locked_until" timestamptz null,
      add column "locked_by" varchar(100) null;
    `);

    this.addSql(`
      create index "outbox_events_pending_retry_idx"
      on "outbox_events" ("next_attempt_at", "created_at")
      where "published_at" is null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      drop index if exists "outbox_events_pending_retry_idx";
    `);

    this.addSql(`
      alter table "outbox_events"
      drop column if exists "next_attempt_at",
      drop column if exists "locked_until",
      drop column if exists "locked_by";
    `);
  }
}