import { Migration } from '@mikro-orm/migrations';

export class Migration20261104162047 extends Migration {
  override name = 'Migration20261104162047';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "wallets" ("id" uuid not null, "player_id" varchar(100) not null, "currency" varchar(3) not null, "balance" varchar(40) not null, "version" int not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`,
    );
    this.addSql(
      `alter table "wallets" add constraint "wallets_player_id_currency_unique" unique ("player_id", "currency");`,
    );
    this.addSql(
      `alter table "wallets" add constraint "wallets_balance_format_check" check ("balance" ~ '^[0-9]+[.][0-9]{2}$');`,
    );
    this.addSql(
      `alter table "wallets" add constraint "wallets_version_check" check ("version" >= 1);`,
    );
    this.addSql(
      `alter table "wallets" add constraint "wallets_currency_check" check ("currency" ~ '^[A-Z]{3}$');`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "wallets" cascade;`);
  }
}
