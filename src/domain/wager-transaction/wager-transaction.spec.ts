import { describe, expect, it } from 'bun:test';
import { Money } from '../shared/money.js';
import {
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction.js';
import { LedgerDirection } from '../ledger/wallet-ledger-entry.js';

describe('WagerTransaction', () => {
  const createTransaction = (
    kind: WagerTransactionKind = WagerTransactionKind.Bet,
    referenceExternalTransactionId?: string,
  ): WagerTransaction => {
    return WagerTransaction.create({
      id: 'transaction-1',
      providerId: 'provider-1',
      externalTransactionId: 'external-1',
      idempotencyKey: 'idempotency-1',
      payloadHash: 'hash-123',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind,
      money: Money.from({
        amount: '30.00',
        currency: 'BRL',
      }),
      referenceExternalTransactionId,
      createdAt: new Date('2026-11-04T12:00:00.000Z'),
    });
  };

  const createProcessedBet = (): WagerTransaction => {
    const bet = createTransaction();

    bet.markProcessed(undefined, new Date());

    return bet;
  };

  it('should create a transaction with pending status', () => {
    const transaction = createTransaction();

    expect(transaction.status).toBe(WagerTransactionStatus.Pending);
    expect(transaction.isTerminal()).toBe(false);
  });

  it('should require reference for refund', () => {
    expect(() => {
      createTransaction(WagerTransactionKind.Refund);
    }).toThrow('REFERENCE_EXTERNAL_TRANSACTION_ID_REQUIRED');
  });

  it('should require reference for rollback', () => {
    expect(() => {
      createTransaction(WagerTransactionKind.Rollback);
    }).toThrow('REFERENCE_EXTERNAL_TRANSACTION_ID_REQUIRED');
  });

  it('should allow win without reference', () => {
    const transaction = createTransaction(WagerTransactionKind.Win);

    expect(transaction.status).toBe(WagerTransactionStatus.Pending);
    expect(transaction.requiresReference()).toBe(false);
  });

  it('should mark transaction as pending reference', () => {
    const transaction = createTransaction(
      WagerTransactionKind.Refund,
      'external-bet-1',
    );

    transaction.markPendingReference();

    expect(transaction.status).toBe(WagerTransactionStatus.PendingReference);
  });

  it('should mark transaction as processed', () => {
    const transaction = createTransaction();
    const processedAt = new Date();

    transaction.markProcessed(undefined, processedAt);

    expect(transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(transaction.processedAt?.getTime()).toBe(processedAt.getTime());
    expect(transaction.isTerminal()).toBe(true);
  });

  it('should require internal reference when processing refund', () => {
    const transaction = createTransaction(
      WagerTransactionKind.Refund,
      'external-bet-1',
    );

    expect(() => {
      transaction.markProcessed(undefined, new Date());
    }).toThrow('REFERENCE_TRANSACTION_ID_REQUIRED');
  });

  it('should reject transaction with failure code', () => {
    const transaction = createTransaction();

    transaction.reject(FailureCode.InsufficientFunds);

    expect(transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(transaction.failureCode).toBe(FailureCode.InsufficientFunds);
    expect(transaction.isTerminal()).toBe(true);
  });

  it('should fail transaction with failure code', () => {
    const transaction = createTransaction();

    transaction.fail(FailureCode.ProcessingFailure);

    expect(transaction.status).toBe(WagerTransactionStatus.Failed);
    expect(transaction.failureCode).toBe(FailureCode.ProcessingFailure);
  });

  it('should prevent transition from terminal status', () => {
    const transaction = createTransaction();

    transaction.reject(FailureCode.InsufficientFunds);

    expect(() => {
      transaction.markProcessed(undefined, new Date());
    }).toThrow('INVALID_TRANSACTION_STATE');
  });

  it('should identify transactions that affect balance', () => {
    const bet = createTransaction(WagerTransactionKind.Bet);
    const loss = createTransaction(WagerTransactionKind.Loss);

    expect(bet.affectsBalance()).toBe(true);
    expect(loss.affectsBalance()).toBe(false);
  });

  it('should identify transactions that require reference', () => {
    const refund = createTransaction(
      WagerTransactionKind.Refund,
      'external-bet-1',
    );

    const rollback = createTransaction(
      WagerTransactionKind.Rollback,
      'external-bet-1',
    );

    expect(refund.requiresReference()).toBe(true);
    expect(rollback.requiresReference()).toBe(true);
  });

  it('should match identical payload hash', () => {
    const transaction = createTransaction();

    expect(transaction.matchesPayload('hash-123')).toBe(true);
    expect(transaction.matchesPayload('different-hash')).toBe(false);
  });

  it('should return debit direction for bet', () => {
    const transaction = createTransaction();

    expect(transaction.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
  });

  it('should return credit direction for win', () => {
    const transaction = createTransaction(WagerTransactionKind.Win);

    expect(transaction.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
  });

  it('should not generate ledger direction for loss', () => {
    const transaction = createTransaction(WagerTransactionKind.Loss);

    expect(() => {
      transaction.ledgerDirectionFor();
    }).toThrow('TRANSACTION_HAS_NO_LEDGER_ENTRY');
  });

  it('should return credit direction for refund', () => {
    const bet = createProcessedBet();

    const refund = createTransaction(
      WagerTransactionKind.Refund,
      bet.externalTransactionId,
    );

    expect(refund.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
  });

  it('should return inverse direction for rollback of bet', () => {
    const bet = createProcessedBet();

    const rollback = createTransaction(
      WagerTransactionKind.Rollback,
      bet.externalTransactionId,
    );

    expect(rollback.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
  });

  it('should return inverse direction for rollback of win', () => {
    const win = createTransaction(WagerTransactionKind.Win);

    win.markProcessed(undefined, new Date());

    const rollback = createTransaction(
      WagerTransactionKind.Rollback,
      win.externalTransactionId,
    );

    expect(rollback.ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
  });

  it('should reject reference with different amount', () => {
    const bet = WagerTransaction.create({
      id: 'bet-1',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-1',
      idempotencyKey: 'idempotency-bet-1',
      payloadHash: 'hash-bet',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '50.00',
        currency: 'BRL',
      }),
      createdAt: new Date(),
    });

    bet.markProcessed(undefined, new Date());

    const refund = createTransaction(
      WagerTransactionKind.Refund,
      bet.externalTransactionId,
    );

    expect(() => {
      refund.ledgerDirectionFor(bet);
    }).toThrow('REFERENCE_AMOUNT_MISMATCH');
  });

  it('should restore a persisted transaction', () => {
    const transaction = WagerTransaction.rehydrate({
      id: 'transaction-1',
      providerId: 'provider-1',
      externalTransactionId: 'external-1',
      idempotencyKey: 'idempotency-1',
      payloadHash: 'hash-123',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '30.00',
        currency: 'BRL',
      }),
      createdAt: new Date(),
      status: WagerTransactionStatus.Processed,
      processedAt: new Date(),
    });

    expect(transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(transaction.isTerminal()).toBe(true);
  });
});
