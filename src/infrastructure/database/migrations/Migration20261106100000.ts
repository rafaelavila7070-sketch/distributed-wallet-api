import { Migration } from '@mikro-orm/migrations';

export class Migration20261106100000 extends Migration {
  override name = 'Migration20261106100000';

  override up(): void | Promise<void> {
    this.addSql(`
      alter table "inbox_messages"
      add column "processed_at" timestamptz null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "inbox_messages"
      drop column "processed_at";
    `);
  }
}
