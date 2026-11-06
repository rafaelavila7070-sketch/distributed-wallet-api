
import { createHash, randomUUID } from 'node:crypto';

import { WalletLedgerEntry, LedgerDirection } from '../../domain/ledger/wallet-ledger-entry.js';
import { Money } from '../../domain/shared/money.js';
import {
  WagerTransaction,
  WagerTransactionKind,
} from '../../domain/wager-transaction/wager-transaction.js';
import { Wallet } from '../../domain/wallet/wallet.js';
import { ApplicationError } from '../errors/application-error.js';
import type { WalletUnitOfWork } from '../ports/wallet-unit-of-work.js';

export interface InitialBalance {
  amount: string;
  currency: string;
}

export interface CreateWalletCommand {
  playerId: string;
  currency: string;
  initialBalance?: InitialBalance;
}

export class CreateWalletUseCase {
  constructor(private readonly unitOfWork: WalletUnitOfWork) {}

  async execute(command: CreateWalletCommand): Promise<Wallet> {
    const playerId = command.playerId?.trim();
    const currency = command.currency?.trim().toUpperCase() ?? '';

    if (!playerId || playerId.length > 100) {
      throw new ApplicationError('INVALID_PLAYER_ID', 400);
    }

    try {
      Money.zero(currency);
    } catch {
      throw new ApplicationError('INVALID_CURRENCY', 400);
    }

    let initialMoney: Money | undefined;

    if (command.initialBalance !== undefined) {
      try {
        if (
          !command.initialBalance ||
          typeof command.initialBalance.amount !== 'string' ||
          typeof command.initialBalance.currency !== 'string'
        ) {
          throw new Error('INVALID_INITIAL_BALANCE');
        }

        const initialCurrency =
          command.initialBalance.currency.trim().toUpperCase();

        initialMoney = Money.from({
          amount: command.initialBalance.amount.trim(),
          currency: initialCurrency,
        });

        if (initialMoney.isNegative()) {
          throw new Error('INVALID_INITIAL_BALANCE');
        }

        if (initialMoney.currency !== currency) {
          throw new Error('CURRENCY_MISMATCH');
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'CURRENCY_MISMATCH') {
          throw new ApplicationError('INITIAL_BALANCE_CURRENCY_MISMATCH', 400);
        }

        throw new ApplicationError('INVALID_INITIAL_BALANCE', 400);
      }
    }

    try {
      return await this.unitOfWork.execute(async (repositories) => {
        const {
          wallets,
          transactions,
          ledger,
          outbox,
        } = repositories;

        const existing = await wallets.findByPlayerIdAndCurrency(
          playerId,
          currency,
        );

        if (existing) {
          throw new ApplicationError('WALLET_ALREADY_EXISTS', 409);
        }

        const wallet = Wallet.create({
          id: randomUUID(),
          playerId,
          currency,
        });

        await wallets.save(wallet);

        if (!initialMoney || initialMoney.isZero()) {
          return wallet;
        }

        const now = new Date();
        const transactionId = randomUUID();
        const internalTransactionId = `wallet-opening:${wallet.id}`;

        const payloadHash = createHash('sha256')
          .update(
            JSON.stringify({
              walletId: wallet.id,
              playerId,
              kind: WagerTransactionKind.Opening,
              amount: initialMoney.toString(),
              currency,
            }),
          )
          .digest('hex');

        const transaction = WagerTransaction.create({
          id: transactionId,
          providerId: 'internal',
          externalTransactionId: internalTransactionId,
          idempotencyKey: internalTransactionId,
          payloadHash,
          walletId: wallet.id,
          playerId,
          roundId: 'wallet-opening',
          gameId: 'wallet-opening',
          kind: WagerTransactionKind.Opening,
          money: initialMoney,
          createdAt: now,
        });

        const balanceBefore = wallet.balance;

        wallet.credit(initialMoney);
        transaction.markProcessed(undefined, now);

        const ledgerEntry = WalletLedgerEntry.create({
          id: randomUUID(),
          walletId: wallet.id,
          transactionId: transaction.id,
          direction: LedgerDirection.Credit,
          money: initialMoney,
          balanceBefore,
          balanceAfter: wallet.balance,
          createdAt: now,
        });

        await wallets.save(wallet);
        await transactions.save(transaction);
        await ledger.save(ledgerEntry);

        await outbox.save({
          eventId: `${transaction.id}:PROCESSED`,
          aggregateType: 'WagerTransaction',
          aggregateId: transaction.id,
          eventType: 'wager.transaction.processed',
          createdAt: now,
          payload: {
            transactionId: transaction.id,
            providerId: transaction.providerId,
            externalTransactionId: transaction.externalTransactionId,
            walletId: wallet.id,
            playerId,
            kind: transaction.kind,
            status: transaction.status,
            amount: initialMoney.toString(),
            currency,
          },
        });

        await outbox.save({
          eventId: `${wallet.id}:BALANCE_CHANGED`,
          aggregateType: 'Wallet',
          aggregateId: wallet.id,
          eventType: 'wallet.balance.changed',
          createdAt: now,
          payload: {
            walletId: wallet.id,
            playerId,
            previousBalance: balanceBefore.toString(),
            balance: wallet.balance.toString(),
            currency,
            transactionId: transaction.id,
          },
        });

        return wallet;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ApplicationError('WALLET_ALREADY_EXISTS', 409);
      }

      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const candidate = error as {
      code?: string;
      cause?: { code?: string };
    };

    return candidate.code === '23505' || candidate.cause?.code === '23505';
  }
}
