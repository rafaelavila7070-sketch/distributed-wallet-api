import 'dotenv/config';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { defineConfig } from '@mikro-orm/postgresql';
import type { Options } from '@mikro-orm/postgresql';

import { WalletEntity } from './infrastructure/database/entities/wallet.entity.js';
import { WagerTransactionEntity } from './infrastructure/database/entities/wager-transaction.entity.js';
import { WalletLedgerEntryEntity } from './infrastructure/database/entities/wallet-ledger-entry.entity.js';
import { OutboxEventEntity } from './infrastructure/database/entities/outbox-event.entity.js';
import { InboxMessageEntity } from './infrastructure/database/entities/inbox-message.entity.js';

const config: Partial<Options> = defineConfig({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  dbName: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  entities: [
    WalletEntity,
    WagerTransactionEntity,
    WalletLedgerEntryEntity,
    OutboxEventEntity,
    InboxMessageEntity,
  ],
  metadataProvider: ReflectMetadataProvider,
  migrations: {
    path: './dist/infrastructure/database/migrations',
    pathTs: './src/infrastructure/database/migrations',
    transactional: true,
    allOrNothing: true,
  },
});

export const mikroOrmConfig: Partial<Options> = { ...config };
export default mikroOrmConfig;