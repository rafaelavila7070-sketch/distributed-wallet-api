import { describe, expect, it } from 'bun:test';
import { Money } from './money';

describe('Money', () => {
  it('should add monetary values', () => {
    const first = Money.from({ amount: '10.50', currency: 'BRL' });
    const second = Money.from({ amount: '5.25', currency: 'BRL' });

    expect(first.add(second).toString()).toBe('15.75');
  });

  it('should subtract monetary values', () => {
    const first = Money.from({ amount: '10.00', currency: 'BRL' });
    const second = Money.from({ amount: '15.00', currency: 'BRL' });

    expect(first.subtract(second).toString()).toBe('-5.00');
  });

  it('should reject invalid decimal values', () => {
    expect(() => Money.from({ amount: '10.999', currency: 'BRL' })).toThrow(
      'INVALID_MONEY_AMOUNT',
    );
  });

  it('should reject scientific notation', () => {
    expect(() => Money.from({ amount: '1e3', currency: 'BRL' })).toThrow(
      'INVALID_MONEY_AMOUNT',
    );
  });

  it('should reject negative input values', () => {
    expect(() => Money.from({ amount: '-10.00', currency: 'BRL' })).toThrow(
      'INVALID_MONEY_AMOUNT',
    );
  });

  it('should reject different currencies', () => {
    const brl = Money.from({ amount: '10.00', currency: 'BRL' });
    const usd = Money.from({ amount: '10.00', currency: 'USD' });

    expect(() => brl.add(usd)).toThrow('CURRENCY_MISMATCH');
  });

  it('should serialize with two decimal places', () => {
    const money = Money.from({ amount: '25', currency: 'BRL' });

    expect(money.toJSON()).toEqual({
      amount: '25.00',
      currency: 'BRL',
    });
  });

  it('should compare monetary values', () => {
    const first = Money.from({ amount: '10.00', currency: 'BRL' });
    const second = Money.from({ amount: '20.00', currency: 'BRL' });

    expect(first.isLessThan(second)).toBe(true);
    expect(second.isPositive()).toBe(true);
    expect(first.equals(second)).toBe(false);
  });

  it('should support values larger than the safe integer range', () => {
    const first = Money.from({
      amount: '9007199254740993.00',
      currency: 'BRL',
    });

    const second = Money.from({
      amount: '1.00',
      currency: 'BRL',
    });

    expect(first.add(second).toString()).toBe('9007199254740994.00');
  });
});
