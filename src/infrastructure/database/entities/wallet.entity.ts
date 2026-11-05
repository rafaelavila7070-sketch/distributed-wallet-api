import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'wallets' })
@Unique({ properties: ['playerId', 'currency'] })
export class WalletEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({
    fieldName: 'player_id',
    type: 'varchar',
    length: 100,
  })
  playerId!: string;

  @Property({
    type: 'varchar',
    length: 3,
  })
  currency!: string;

  @Property({
    type: 'varchar',
    length: 40,
  })
  balance!: string;

  @Property({
    type: 'integer',
  })
  version!: number;

  @Property({
    fieldName: 'created_at',
    type: 'timestamptz',
    defaultRaw: 'now()',
  })
  createdAt!: Date;

  @Property({
    fieldName: 'updated_at',
    type: 'timestamptz',
    defaultRaw: 'now()',
  })
  updatedAt!: Date;
}
