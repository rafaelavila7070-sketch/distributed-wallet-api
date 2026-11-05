import { describe, expect, it } from 'bun:test';
import { Money } from '../shared/money.js';
import { Wallet } from './wallet.js';

describe('Wallet', () => {
  const createWallet = (): Wallet => {
    return Wallet.create({
      id: 'wallet-1',
      playerId: 'player-1',
      currency: 'BRL',
    });
  };

  it('should create a wallet with zero balance and version 1', () => {
    const wallet = createWallet();

    expect(wallet.balance.toString()).toBe('0.00');
    expect(wallet.balance.currency).toBe('BRL');
    expect(wallet.version).toBe(1);
  });

  it('should credit the wallet balance', () => {
    const wallet = createWallet();

    wallet.credit(Money.from({ amount: '100.00', currency: 'BRL' }));

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(2);
  });

  it('should debit the wallet balance', () => {
    const wallet = createWallet();

    wallet.credit(Money.from({ amount: '100.00', currency: 'BRL' }));

    wallet.debit(Money.from({ amount: '30.00', currency: 'BRL' }));

    expect(wallet.balance.toString()).toBe('70.00');
    expect(wallet.version).toBe(3);
  });

  it('should reject debit when balance is insufficient', () => {
    const wallet = createWallet();

    expect(() => {
      wallet.debit(Money.from({ amount: '10.00', currency: 'BRL' }));
    }).toThrow('INSUFFICIENT_FUNDS');

    expect(wallet.balance.toString()).toBe('0.00');
    expect(wallet.version).toBe(1);
  });

  it('should reject zero amount transactions', () => {
    const wallet = createWallet();

    expect(() => {
      wallet.credit(Money.zero('BRL'));
    }).toThrow('INVALID_TRANSACTION_AMOUNT');

    expect(wallet.version).toBe(1);
  });

  it('should reject transactions with different currencies', () => {
    const wallet = createWallet();

    expect(() => {
      wallet.credit(Money.from({ amount: '10.00', currency: 'USD' }));
    }).toThrow('CURRENCY_MISMATCH');

    expect(wallet.version).toBe(1);
  });

  it('should restore a wallet with its persisted state', () => {
    const wallet = Wallet.restore({
      id: 'wallet-1',
      playerId: 'player-1',
      balance: Money.from({
        amount: '250.50',
        currency: 'BRL',
      }),
      version: 5,
    });

    expect(wallet.balance.toString()).toBe('250.50');
    expect(wallet.version).toBe(5);
  });

  it('should reject restoring a wallet with negative balance', () => {
    const negativeBalance = Money.from({
      amount: '10.00',
      currency: 'BRL',
    }).negate();

    expect(() => {
      Wallet.restore({
        id: 'wallet-1',
        playerId: 'player-1',
        balance: negativeBalance,
        version: 2,
      });
    }).toThrow('INVALID_WALLET_BALANCE');
  });

  it('should not increment version when debit fails', () => {
    const wallet = createWallet();

    expect(() => {
      wallet.debit(Money.from({ amount: '50.00', currency: 'BRL' }));
    }).toThrow('INSUFFICIENT_FUNDS');

    expect(wallet.version).toBe(1);
  });
});
