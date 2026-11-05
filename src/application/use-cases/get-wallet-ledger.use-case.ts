import { ApplicationError } from '../errors/application-error.js';
import type { WalletUnitOfWork } from '../ports/wallet-unit-of-work.js';
import { WalletLedgerEntry } from '../../domain/ledger/wallet-ledger-entry.js';

export class GetWalletLedgerUseCase {
  constructor(private readonly unitOfWork: WalletUnitOfWork) {}

  execute(walletId: string): Promise<WalletLedgerEntry[]> {
    return this.unitOfWork.execute(async ({ wallets, ledger }) => {
      const wallet = await wallets.findById(walletId);
      if (!wallet) {
        throw new ApplicationError('WALLET_NOT_FOUND', 404);
      }
      return ledger.findByWalletId(walletId);
    });
  }
}
