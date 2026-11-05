import { describe, expect, it } from 'bun:test';
import { Money } from '../shared/money.js';
import { LedgerDirection, WalletLedgerEntry } from './wallet-ledger-entry.js';

describe('WalletLedgerEntry', () => {
  const createEntry = (
    direction: LedgerDirection = LedgerDirection.Debit,
  ): WalletLedgerEntry => {
    return WalletLedgerEntry.create({
      id: 'ledger-1',
      walletId: 'wallet-1',
      transactionId: 'transaction-1',
      direction,
      money: Money.from({
        amount: '30.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: direction === LedgerDirection.Debit ? '70.00' : '130.00',
        currency: 'BRL',
      }),
      createdAt: new Date('2026-11-04T12:00:00.000Z'),
    });
  };

  it('should create a debit ledger entry', () => {
    const entry = createEntry();

    expect(entry.direction).toBe(LedgerDirection.Debit);
    expect(entry.money.toString()).toBe('30.00');
    expect(entry.balanceBefore.toString()).toBe('100.00');
    expect(entry.balanceAfter.toString()).toBe('70.00');
    expect(entry.isBalanced()).toBe(true);
  });

  it('should create a credit ledger entry', () => {
    const entry = createEntry(LedgerDirection.Credit);

    expect(entry.direction).toBe(LedgerDirection.Credit);
    expect(entry.balanceAfter.toString()).toBe('130.00');
    expect(entry.isBalanced()).toBe(true);
  });

  it('should reject an unbalanced debit entry', () => {
    expect(() => {
      WalletLedgerEntry.create({
        id: 'ledger-1',
        walletId: 'wallet-1',
        transactionId: 'transaction-1',
        direction: LedgerDirection.Debit,
        money: Money.from({
          amount: '30.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '80.00',
          currency: 'BRL',
        }),
        createdAt: new Date(),
      });
    }).toThrow('UNBALANCED_LEDGER_ENTRY');
  });

  it('should reject an unbalanced credit entry', () => {
    expect(() => {
      WalletLedgerEntry.create({
        id: 'ledger-1',
        walletId: 'wallet-1',
        transactionId: 'transaction-1',
        direction: LedgerDirection.Credit,
        money: Money.from({
          amount: '30.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '120.00',
          currency: 'BRL',
        }),
        createdAt: new Date(),
      });
    }).toThrow('UNBALANCED_LEDGER_ENTRY');
  });

  it('should reject zero amount', () => {
    expect(() => {
      WalletLedgerEntry.create({
        id: 'ledger-1',
        walletId: 'wallet-1',
        transactionId: 'transaction-1',
        direction: LedgerDirection.Credit,
        money: Money.zero('BRL'),
        balanceBefore: Money.zero('BRL'),
        balanceAfter: Money.zero('BRL'),
        createdAt: new Date(),
      });
    }).toThrow('INVALID_LEDGER_AMOUNT');
  });

  it('should reject different currencies', () => {
    expect(() => {
      WalletLedgerEntry.create({
        id: 'ledger-1',
        walletId: 'wallet-1',
        transactionId: 'transaction-1',
        direction: LedgerDirection.Credit,
        money: Money.from({
          amount: '30.00',
          currency: 'USD',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '130.00',
          currency: 'BRL',
        }),
        createdAt: new Date(),
      });
    }).toThrow('CURRENCY_MISMATCH');
  });

  it('should reject invalid identification', () => {
    expect(() => {
      WalletLedgerEntry.create({
        id: '',
        walletId: 'wallet-1',
        transactionId: 'transaction-1',
        direction: LedgerDirection.Debit,
        money: Money.from({
          amount: '30.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '70.00',
          currency: 'BRL',
        }),
        createdAt: new Date(),
      });
    }).toThrow('INVALID_LEDGER_IDENTIFICATION');
  });

  it('should restore a persisted ledger entry', () => {
    const entry = WalletLedgerEntry.rehydrate({
      id: 'ledger-1',
      walletId: 'wallet-1',
      transactionId: 'transaction-1',
      direction: LedgerDirection.Debit,
      money: Money.from({
        amount: '30.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '70.00',
        currency: 'BRL',
      }),
      createdAt: new Date('2026-11-04T12:00:00.000Z'),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.balanceAfter.toString()).toBe('70.00');
  });

  it('should not expose the internal date reference', () => {
    const entry = createEntry();
    const originalDate = entry.createdAt;

    originalDate.setFullYear(2000);

    expect(entry.createdAt.getFullYear()).toBe(2026);
  });

  it('should freeze the ledger entry', () => {
    const entry = createEntry();

    expect(Object.isFrozen(entry)).toBe(true);
  });
});
