import { Money } from '../shared/money.js';

export enum LedgerDirection {
  Debit = 'DEBIT',
  Credit = 'CREDIT',
}

export interface CreateLedgerEntryProps {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export interface LedgerEntryState extends CreateLedgerEntryProps {}

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    private readonly createdAtValue: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    this.validate(props);

    return new WalletLedgerEntry(
      props.id,
      props.walletId,
      props.transactionId,
      props.direction,
      props.money,
      props.balanceBefore,
      props.balanceAfter,
      new Date(props.createdAt.getTime()),
    );
  }

  static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    this.validate(state);

    return new WalletLedgerEntry(
      state.id,
      state.walletId,
      state.transactionId,
      state.direction,
      state.money,
      state.balanceBefore,
      state.balanceAfter,
      new Date(state.createdAt.getTime()),
    );
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  isBalanced(): boolean {
    const expectedBalance =
      this.direction === LedgerDirection.Debit
        ? this.balanceBefore.subtract(this.money)
        : this.balanceBefore.add(this.money);

    return expectedBalance.equals(this.balanceAfter);
  }

  private static validate(props: CreateLedgerEntryProps): void {
    if (!props.id || !props.walletId || !props.transactionId) {
      throw new Error('INVALID_LEDGER_IDENTIFICATION');
    }

    if (!Object.values(LedgerDirection).includes(props.direction)) {
      throw new Error('INVALID_LEDGER_DIRECTION');
    }

    if (
      !(props.createdAt instanceof Date) ||
      Number.isNaN(props.createdAt.getTime())
    ) {
      throw new Error('INVALID_LEDGER_DATE');
    }

    if (!props.money.isPositive()) {
      throw new Error('INVALID_LEDGER_AMOUNT');
    }

    if (props.balanceBefore.isNegative() || props.balanceAfter.isNegative()) {
      throw new Error('INVALID_LEDGER_BALANCE');
    }

    if (
      props.money.currency !== props.balanceBefore.currency ||
      props.money.currency !== props.balanceAfter.currency
    ) {
      throw new Error('CURRENCY_MISMATCH');
    }

    const expectedBalance =
      props.direction === LedgerDirection.Debit
        ? props.balanceBefore.subtract(props.money)
        : props.balanceBefore.add(props.money);

    if (!expectedBalance.equals(props.balanceAfter)) {
      throw new Error('UNBALANCED_LEDGER_ENTRY');
    }
  }
}
