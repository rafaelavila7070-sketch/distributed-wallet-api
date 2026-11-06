import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import type {
  WalletRepositories,
  WalletUnitOfWork,
} from '../../application/ports/wallet-unit-of-work.js';

import { MikroOrmInboxMessageRepository } from './repositories/mikro-orm-inbox-message.repository.js';
import { MikroOrmOutboxEventRepository } from './repositories/mikro-orm-outbox-event.repository.js';
import { MikroOrmWalletLedgerRepository } from './repositories/mikro-orm-wallet-ledger.repository.js';
import { MikroOrmWagerTransactionRepository } from './repositories/mikro-orm-wager-transaction.repository.js';
import { MikroOrmWalletRepository } from './repositories/mikro-orm-wallet.repository.js';

@Injectable()
export class MikroOrmWalletUnitOfWork implements WalletUnitOfWork {
  constructor(private readonly em: EntityManager) {}

  execute<T>(
    work: (repositories: WalletRepositories) => Promise<T>,
  ): Promise<T> {
    return this.em.transactional(async (transactionalEm) => {
      const repositories: WalletRepositories = {
        wallets: new MikroOrmWalletRepository(transactionalEm),
        transactions: new MikroOrmWagerTransactionRepository(transactionalEm),
        ledger: new MikroOrmWalletLedgerRepository(transactionalEm),
        outbox: new MikroOrmOutboxEventRepository(transactionalEm),
        inbox: new MikroOrmInboxMessageRepository(transactionalEm),
      };

      return work(repositories);
    });
  }
}