import { WalletLedgerRepository } from './wallet-ledger-repository.js';
import { WagerTransactionRepository } from './wager-transaction-repository.js';
import { WalletRepository } from './wallet-repository.js';

export const WALLET_UNIT_OF_WORK = Symbol('WALLET_UNIT_OF_WORK');

export interface WalletRepositories {
  wallets: WalletRepository;
  transactions: WagerTransactionRepository;
  ledger: WalletLedgerRepository;
}

export interface WalletUnitOfWork {
  execute<T>(
    work: (repositories: WalletRepositories) => Promise<T>,
  ): Promise<T>;
}
