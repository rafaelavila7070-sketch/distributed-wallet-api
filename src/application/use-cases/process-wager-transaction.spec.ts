
import { describe, expect, it } from 'bun:test';
import { Wallet } from '../../domain/wallet/wallet.js';
import {
  WagerTransactionKind,
  WagerTransaction,
} from '../../domain/wager-transaction/wager-transaction.js';
import { WalletLedgerEntry } from '../../domain/ledger/wallet-ledger-entry.js';
import type {
  WalletRepositories,
  WalletUnitOfWork,
} from '../ports/wallet-unit-of-work.js';
import type { WalletRepository } from '../ports/wallet-repository.js';
import type { WagerTransactionRepository } from '../ports/wager-transaction-repository.js';
import type { WalletLedgerRepository } from '../ports/wallet-ledger-repository.js';
import { CreateWalletUseCase } from './create-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case.js';

class InMemoryUnitOfWork implements WalletUnitOfWork {
  readonly wallets = new Map<string, Wallet>();
  readonly transactions = new Map<string, WagerTransaction>();
  readonly ledger = new Map<string, WalletLedgerEntry>();

  private readonly walletRepository: WalletRepository = {
    findById: async (id) => this.wallets.get(id) ?? null,
    findByPlayerIdAndCurrency: async (playerId, currency) =>
      [...this.wallets.values()].find(
        (wallet) =>
          wallet.playerId === playerId && wallet.balance.currency === currency,
      ) ?? null,
    save: async (wallet) => {
      this.wallets.set(wallet.id, wallet);
    },
  };

  private readonly transactionRepository: WagerTransactionRepository = {
    findById: async (id) => this.transactions.get(id) ?? null,
    findByIdForUpdate: async (id) => this.transactions.get(id) ?? null,
    findByExternalTransactionId: async (providerId, externalId) =>
      [...this.transactions.values()].find(
        (transaction) =>
          transaction.providerId === providerId &&
          transaction.externalTransactionId === externalId,
      ) ?? null,
    findByIdempotencyKey: async (key) =>
      [...this.transactions.values()].find(
        (transaction) => transaction.idempotencyKey === key,
      ) ?? null,
    findReversalForReference: async (referenceId) =>
      [...this.transactions.values()].find(
        (transaction) =>
          transaction.referenceTransactionId === referenceId &&
          [WagerTransactionKind.Refund, WagerTransactionKind.Rollback].includes(
            transaction.kind,
          ),
      ) ?? null,
    save: async (transaction) => {
      this.transactions.set(transaction.id, transaction);
    },
  };

  private readonly ledgerRepository: WalletLedgerRepository = {
    findByTransactionId: async (transactionId) =>
      [...this.ledger.values()].find(
        (entry) => entry.transactionId === transactionId,
      ) ?? null,
    findByWalletId: async (walletId) =>
      [...this.ledger.values()].filter((entry) => entry.walletId === walletId),
    save: async (entry) => {
      this.ledger.set(entry.id, entry);
    },
  };

  async execute<T>(
    work: (repositories: WalletRepositories) => Promise<T>,
  ): Promise<T> {
    return work({
      wallets: this.walletRepository,
      transactions: this.transactionRepository,
      ledger: this.ledgerRepository,
    });
  }
}

describe('ProcessWagerTransactionUseCase', () => {
  const setup = async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const createWallet = new CreateWalletUseCase(unitOfWork);
    const process = new ProcessWagerTransactionUseCase(unitOfWork);
    const wallet = await createWallet.execute({
      playerId: 'player-1',
      currency: 'BRL',
    });
    return { unitOfWork, process, wallet };
  };

  const command = (
    kind: WagerTransactionKind,
    externalTransactionId: string,
    amount: string,
    extra: Partial<{
      referenceExternalTransactionId: string;
      idempotencyKey: string;
    }> = {},
  ) => ({
    providerId: 'provider-1',
    externalTransactionId,
    idempotencyKey: extra.idempotencyKey ?? `key-${externalTransactionId}`,
    playerId: 'player-1',
    currency: 'BRL',
    roundId: 'round-1',
    gameId: 'game-1',
    kind,
    amount,
    ...('referenceExternalTransactionId' in extra
      ? { referenceExternalTransactionId: extra.referenceExternalTransactionId }
      : {}),
  });

  it('creates a wallet with zero balance', async () => {
    const { wallet } = await setup();
    expect(wallet.balance.toString()).toBe('0.00');
    expect(wallet.version).toBe(1);
  });

  it('credits opening and debits a bet with ledger entries', async () => {
    const { unitOfWork, process } = await setup();

    const opening = await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );
    const bet = await process.execute(
      command(WagerTransactionKind.Bet, 'bet-1', '30.00'),
    );

    const wallet = [...unitOfWork.wallets.values()][0];
    expect(opening.status).toBe('PROCESSED');
    expect(bet.status).toBe('PROCESSED');
    expect(wallet.balance.toString()).toBe('70.00');
    expect(unitOfWork.ledger.size).toBe(2);
  });

  it('does not apply the same idempotent transaction twice', async () => {
    const { unitOfWork, process } = await setup();
    const openingCommand = command(
      WagerTransactionKind.Opening,
      'opening-1',
      '100.00',
    );

    await process.execute(openingCommand);
    const replay = await process.execute(openingCommand);

    expect(replay.status).toBe('PROCESSED');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '100.00',
    );
    expect(unitOfWork.ledger.size).toBe(1);
  });

  it('rejects a bet when funds are insufficient', async () => {
    const { unitOfWork, process } = await setup();
    const bet = await process.execute(
      command(WagerTransactionKind.Bet, 'bet-1', '10.00'),
    );

    expect(bet.status).toBe('REJECTED');
    expect(bet.failureCode).toBe('INSUFFICIENT_FUNDS');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe('0.00');
    expect(unitOfWork.ledger.size).toBe(0);
  });

  it('records loss without changing the balance', async () => {
    const { unitOfWork, process } = await setup();
    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );
    const loss = await process.execute(
      command(WagerTransactionKind.Loss, 'loss-1', '100.00'),
    );

    expect(loss.status).toBe('PROCESSED');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '100.00',
    );
    expect(unitOfWork.ledger.size).toBe(1);
  });

  it('keeps a refund pending until its reference arrives, then retries it', async () => {
    const { unitOfWork, process } = await setup();
    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    const refundCommand = command(
      WagerTransactionKind.Refund,
      'refund-1',
      '25.00',
      { referenceExternalTransactionId: 'bet-1' },
    );

    const pending = await process.execute(refundCommand);
    expect(pending.status).toBe('PENDING_REFERENCE');

    await process.execute(command(WagerTransactionKind.Bet, 'bet-1', '25.00'));
    const refund = await process.execute(refundCommand);

    expect(refund.status).toBe('PROCESSED');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '100.00',
    );
  });

  it('rejects a second reversal for the same reference transaction', async () => {
    const { process, unitOfWork } = await setup();
    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );
    await process.execute(command(WagerTransactionKind.Bet, 'bet-1', '20.00'));

    const firstRefund = await process.execute(
      command(WagerTransactionKind.Refund, 'refund-1', '20.00', {
        referenceExternalTransactionId: 'bet-1',
      }),
    );
    const secondRefund = await process.execute(
      command(WagerTransactionKind.Refund, 'refund-2', '20.00', {
        referenceExternalTransactionId: 'bet-1',
      }),
    );

    expect(firstRefund.status).toBe('PROCESSED');
    expect(secondRefund.status).toBe('REJECTED');
    expect(secondRefund.failureCode).toBe('DUPLICATE_REVERSAL');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '100.00',
    );
  });

  it('rejects reusing an idempotency key with a different payload', async () => {
    const { process } = await setup();
    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    await expect(
      process.execute({
        ...command(WagerTransactionKind.Bet, 'bet-1', '10.00'),
        idempotencyKey: 'shared-key',
      }),
    ).resolves.toBeDefined();

    await expect(
      process.execute({
        ...command(WagerTransactionKind.Bet, 'bet-2', '20.00'),
        idempotencyKey: 'shared-key',
      }),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
  });
});
