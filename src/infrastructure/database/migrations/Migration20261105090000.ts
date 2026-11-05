import { Migration } from '@mikro-orm/migrations';

export class Migration20261105090000 extends Migration {
  override name = 'Migration20261105090000';

  override up(): void | Promise<void> {
    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_transactions_provider_external_unique"
      unique ("provider_id", "external_transaction_id");
    `);
    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_transactions_idempotency_unique"
      unique ("idempotency_key");
    `);
    this.addSql(`
      alter table "wallet_ledger_entries"
      add constraint "wallet_ledger_transaction_unique"
      unique ("transaction_id");
    `);
    this.addSql(`
      create unique index "wager_transactions_one_reversal_per_reference"
      on "wager_transactions" ("reference_transaction_id")
      where "reference_transaction_id" is not null
        and "kind" in ('REFUND', 'ROLLBACK')
        and "status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED');
    `);
    this.addSql(`
      create index "wager_transactions_wallet_created_idx"
      on "wager_transactions" ("wallet_id", "created_at" desc);
    `);
    this.addSql(`
      create index "wallet_ledger_wallet_created_idx"
      on "wallet_ledger_entries" ("wallet_id", "created_at" desc);
    `);
  }

  override down(): void | Promise<void> {
    this.addSql('drop index if exists "wallet_ledger_wallet_created_idx";');
    this.addSql(
      'drop index if exists "wager_transactions_wallet_created_idx";',
    );
    this.addSql(
      'drop index if exists "wager_transactions_one_reversal_per_reference";',
    );
    this.addSql(`
      alter table "wallet_ledger_entries"
      drop constraint if exists "wallet_ledger_transaction_unique";
    `);
    this.addSql(`
      alter table "wager_transactions"
      drop constraint if exists "wager_transactions_idempotency_unique";
    `);
    this.addSql(`
      alter table "wager_transactions"
      drop constraint if exists "wager_transactions_provider_external_unique";
    `);
  }
}
