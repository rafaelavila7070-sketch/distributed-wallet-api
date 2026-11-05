import { Money } from '../shared/money.js';

export interface WalletProps {
  id: string;
  playerId: string;
  currency: string;
}

export interface RestoreWalletProps {
  id: string;
  playerId: string;
  balance: Money;
  version: number;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    private currentBalance: Money,
    private currentVersion: number,
  ) {}

  static create(props: WalletProps): Wallet {
    if (!props.id || !props.playerId) {
      throw new Error('INVALID_WALLET_IDENTIFICATION');
    }

    return new Wallet(props.id, props.playerId, Money.zero(props.currency), 1);
  }

  static restore(props: RestoreWalletProps): Wallet {
    if (!props.id || !props.playerId) {
      throw new Error('INVALID_WALLET_IDENTIFICATION');
    }

    if (!Number.isInteger(props.version) || props.version < 1) {
      throw new Error('INVALID_WALLET_VERSION');
    }

    if (props.balance.isNegative()) {
      throw new Error('INVALID_WALLET_BALANCE');
    }

    return new Wallet(props.id, props.playerId, props.balance, props.version);
  }

  get balance(): Money {
    return this.currentBalance;
  }

  get version(): number {
    return this.currentVersion;
  }

  debit(amount: Money): void {
    this.assertPositiveAmount(amount);

    if (this.currentBalance.isLessThan(amount)) {
      throw new Error('INSUFFICIENT_FUNDS');
    }

    this.currentBalance = this.currentBalance.subtract(amount);
    this.currentVersion++;
  }

  credit(amount: Money): void {
    this.assertPositiveAmount(amount);

    this.currentBalance = this.currentBalance.add(amount);
    this.currentVersion++;
  }

  private assertPositiveAmount(amount: Money): void {
    if (!amount.isPositive()) {
      throw new Error('INVALID_TRANSACTION_AMOUNT');
    }

    if (amount.currency !== this.currentBalance.currency) {
      throw new Error('CURRENCY_MISMATCH');
    }
  }
}
