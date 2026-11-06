import { Money } from '../../domain/shared/money.js';
import { LedgerDirection } from '../../domain/ledger/wallet-ledger-entry.js';
import { ApplicationError } from '../errors/application-error.js';
import type { WalletUnitOfWork } from '../ports/wallet-unit-of-work.js';

export interface WalletReconciliationResult {
  walletId: string;
  currency: string;
  walletBalance: string;
  ledgerBalance: string;
  difference: string;
  entriesChecked: number;
  invalidEntries: number;
  isReconciled: boolean;
  reconciledAt: Date;
}

export class ReconcileWalletUseCase {
  constructor(private readonly unitOfWork: WalletUnitOfWork) {}

  execute(walletId: string): Promise<WalletReconciliationResult> {
    return this.unitOfWork.execute(async ({ wallets, ledger }) => {
      const wallet = await wallets.findById(walletId);

      if (!wallet) {
        throw new ApplicationError('WALLET_NOT_FOUND', 404);
      }

      const entries = await ledger.findByWalletId(walletId);

      let calculatedBalance = Money.zero(wallet.balance.currency);
      let invalidEntries = 0;

      for (const entry of entries) {
        if (!entry.isBalanced()) {
          invalidEntries++;
        }

        if (entry.money.currency !== wallet.balance.currency) {
          invalidEntries++;
          continue;
        }

        calculatedBalance =
          entry.direction === LedgerDirection.Credit
            ? calculatedBalance.add(entry.money)
            : calculatedBalance.subtract(entry.money);
      }

      const difference = wallet.balance.subtract(calculatedBalance);

      return {
        walletId: wallet.id,
        currency: wallet.balance.currency,
        walletBalance: wallet.balance.toString(),
        ledgerBalance: calculatedBalance.toString(),
        difference: difference.toString(),
        entriesChecked: entries.length,
        invalidEntries,
        isReconciled:
          difference.isZero() && invalidEntries === 0,
        reconciledAt: new Date(),
      };
    });
  }
}