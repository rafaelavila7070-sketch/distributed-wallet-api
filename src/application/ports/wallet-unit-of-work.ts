import { InboxMessageRepository } from './inbox-message-repository.js';
import { WalletLedgerRepository } from './wallet-ledger-repository.js';
import { OutboxEventRepository } from './outbox-event-repository.js';
import { WagerTransactionRepository } from './wager-transaction-repository.js';
import { WalletRepository } from './wallet-repository.js';

export const WALLET_UNIT_OF_WORK = Symbol('WALLET_UNIT_OF_WORK');

export interface WalletRepositories {
  wallets: WalletRepository;
  transactions: WagerTransactionRepository;
  ledger: WalletLedgerRepository;
  outbox: OutboxEventRepository;
  inbox: InboxMessageRepository;
}

export interface WalletUnitOfWork {
  execute<T>(
    work: (repositories: WalletRepositories) => Promise<T>,
  ): Promise<T>;
}