import { WalletLedgerEntry } from '../../domain/ledger/wallet-ledger-entry.js';

export interface WalletLedgerRepository {
  findByTransactionId(transactionId: string): Promise<WalletLedgerEntry | null>;

  findByWalletId(walletId: string): Promise<WalletLedgerEntry[]>;

  save(entry: WalletLedgerEntry): Promise<void>;
}
