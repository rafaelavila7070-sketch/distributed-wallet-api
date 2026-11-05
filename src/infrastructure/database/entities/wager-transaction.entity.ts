import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import {
  FailureCode,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/wager-transaction/wager-transaction.js';

@Entity({ tableName: 'wager_transactions' })
@Unique({
  name: 'wager_transactions_provider_external_unique',
  properties: ['providerId', 'externalTransactionId'],
})
@Unique({
  name: 'wager_transactions_idempotency_unique',
  properties: ['idempotencyKey'],
})
export class WagerTransactionEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ fieldName: 'provider_id', type: 'varchar', length: 100 })
  providerId!: string;

  @Property({
    fieldName: 'external_transaction_id',
    type: 'varchar',
    length: 150,
  })
  externalTransactionId!: string;

  @Property({
    fieldName: 'idempotency_key',
    type: 'varchar',
    length: 150,
  })
  idempotencyKey!: string;

  @Property({ fieldName: 'payload_hash', type: 'varchar', length: 128 })
  payloadHash!: string;

  @Property({ fieldName: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Property({ fieldName: 'player_id', type: 'varchar', length: 100 })
  playerId!: string;

  @Property({ fieldName: 'round_id', type: 'varchar', length: 150 })
  roundId!: string;

  @Property({ fieldName: 'game_id', type: 'varchar', length: 150 })
  gameId!: string;

  @Property({ type: 'varchar', length: 20 })
  kind!: WagerTransactionKind;

  @Property({ type: 'varchar', length: 40 })
  amount!: string;

  @Property({ type: 'varchar', length: 3 })
  currency!: string;

  @Property({
    fieldName: 'reference_external_transaction_id',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  referenceExternalTransactionId?: string;

  @Property({ type: 'varchar', length: 30 })
  status!: WagerTransactionStatus;

  @Property({
    fieldName: 'reference_transaction_id',
    type: 'uuid',
    nullable: true,
  })
  referenceTransactionId?: string;

  @Property({
    fieldName: 'failure_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  failureCode?: FailureCode;

  @Property({ fieldName: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Property({
    fieldName: 'processed_at',
    type: 'timestamptz',
    nullable: true,
  })
  processedAt?: Date;
}
