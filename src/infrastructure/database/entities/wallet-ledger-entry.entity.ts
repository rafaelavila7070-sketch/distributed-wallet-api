import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { LedgerDirection } from '../../../domain/ledger/wallet-ledger-entry.js';

@Entity({ tableName: 'wallet_ledger_entries' })
@Unique({
  name: 'wallet_ledger_transaction_unique',
  properties: ['transactionId'],
})
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ fieldName: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Property({ fieldName: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @Property({ type: 'varchar', length: 10 })
  direction!: LedgerDirection;

  @Property({ type: 'varchar', length: 40 })
  amount!: string;

  @Property({ type: 'varchar', length: 3 })
  currency!: string;

  @Property({ fieldName: 'balance_before', type: 'varchar', length: 40 })
  balanceBefore!: string;

  @Property({ fieldName: 'balance_after', type: 'varchar', length: 40 })
  balanceAfter!: string;

  @Property({ fieldName: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
