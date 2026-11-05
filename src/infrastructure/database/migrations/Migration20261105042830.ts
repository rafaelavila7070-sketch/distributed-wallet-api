import { Migration } from '@mikro-orm/migrations';

export class Migration20261105042830 extends Migration {
  override name = 'Migration20261105042830';

  override up(): void | Promise<void> {
    this.addSql(`
            create table "wager_transactions" (
                "id" uuid not null,
                "provider_id" varchar(100) not null,
                "external_transaction_id" varchar(150) not null,
                "idempotency_key" varchar(150) not null,
                "payload_hash" varchar(128) not null,
                "wallet_id" uuid not null,
                "player_id" varchar(100) not null,
                "round_id" varchar(150) not null,
                "game_id" varchar(150) not null,
                "kind" varchar(20) not null,
                "amount" varchar(40) not null,
                "currency" varchar(3) not null,
                "reference_external_transaction_id" varchar(150) null,
                "status" varchar(30) not null,
                "reference_transaction_id" uuid null,
                "failure_code" varchar(50) null,
                "created_at" timestamptz not null,
                "processed_at" timestamptz null,
                primary key ("id")
            );
        `);

    this.addSql(`
            create table "wallet_ledger_entries" (
                "id" uuid not null,
                "wallet_id" uuid not null,
                "transaction_id" uuid not null,
                "direction" varchar(10) not null,
                "amount" varchar(40) not null,
                "currency" varchar(3) not null,
                "balance_before" varchar(40) not null,
                "balance_after" varchar(40) not null,
                "created_at" timestamptz not null,
                primary key ("id")
            );
        `);

    this.addSql(`
            alter table "wager_transactions"
            add constraint "wager_transactions_wallet_fk"
            foreign key ("wallet_id")
            references "wallets" ("id");
        `);

    this.addSql(`
            alter table "wager_transactions"
            add constraint "wager_transactions_reference_fk"
            foreign key ("reference_transaction_id")
            references "wager_transactions" ("id");
        `);

    this.addSql(`
            alter table "wallet_ledger_entries"
            add constraint "wallet_ledger_wallet_fk"
            foreign key ("wallet_id")
            references "wallets" ("id");
        `);

    this.addSql(`
            alter table "wallet_ledger_entries"
            add constraint "wallet_ledger_transaction_fk"
            foreign key ("transaction_id")
            references "wager_transactions" ("id");
        `);

    this.addSql(`
            alter table "wager_transactions"
            add constraint "wager_transactions_kind_check"
            check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));
        `);

    this.addSql(`
            alter table "wager_transactions"
            add constraint "wager_transactions_status_check"
            check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));
        `);

    this.addSql(`
            alter table "wager_transactions"
            add constraint "wager_transactions_amount_check"
            check ("amount" ~ '^[0-9]+[.][0-9]{2}$' and "amount" <> '0.00');
        `);

    this.addSql(`
            alter table "wager_transactions"
            add constraint "wager_transactions_currency_check"
            check ("currency" ~ '^[A-Z]{3}$');
        `);

    this.addSql(`
            alter table "wallet_ledger_entries"
            add constraint "wallet_ledger_direction_check"
            check ("direction" in ('DEBIT', 'CREDIT'));
        `);

    this.addSql(`
            alter table "wallet_ledger_entries"
            add constraint "wallet_ledger_amount_check"
            check ("amount" ~ '^[0-9]+[.][0-9]{2}$' and "amount" <> '0.00');
        `);

    this.addSql(`
            alter table "wallet_ledger_entries"
            add constraint "wallet_ledger_balance_check"
            check (
                "balance_before" ~ '^[0-9]+[.][0-9]{2}$'
                and "balance_after" ~ '^[0-9]+[.][0-9]{2}$'
            );
        `);

    this.addSql(`
            alter table "wallet_ledger_entries"
            add constraint "wallet_ledger_currency_check"
            check ("currency" ~ '^[A-Z]{3}$');
        `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
  }
}
