export interface MoneyProps {
  amount: string;
  currency: string;
}

export class Money {
  private constructor(
    private readonly minorUnits: string,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    const { amount, currency } = props;

    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      throw new Error('INVALID_MONEY_AMOUNT');
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error('INVALID_CURRENCY');
    }

    const [integerPart, decimalPart = ''] = amount.split('.');
    const normalizedDecimal = decimalPart.padEnd(2, '0');
    const minorUnits = this.normalizeUnsigned(
      `${integerPart}${normalizedDecimal}`,
    );

    return new Money(minorUnits, currency);
  }

  static zero(currency: string): Money {
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error('INVALID_CURRENCY');
    }

    return new Money('0', currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);

    return Money.fromMinorUnits(
      Money.addSigned(this.minorUnits, other.minorUnits),
      this.currency,
    );
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);

    return Money.fromMinorUnits(
      Money.addSigned(this.minorUnits, Money.negateValue(other.minorUnits)),
      this.currency,
    );
  }

  negate(): Money {
    return Money.fromMinorUnits(
      Money.negateValue(this.minorUnits),
      this.currency,
    );
  }

  isZero(): boolean {
    return this.minorUnits === '0';
  }

  isPositive(): boolean {
    return !this.isZero() && !this.minorUnits.startsWith('-');
  }

  isNegative(): boolean {
    return this.minorUnits.startsWith('-');
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);

    return Money.compareSigned(this.minorUnits, other.minorUnits) < 0;
  }

  equals(other: Money): boolean {
    this.assertSameCurrency(other);

    return this.minorUnits === other.minorUnits;
  }

  toJSON(): MoneyProps {
    return {
      amount: this.toString(),
      currency: this.currency,
    };
  }

  toString(): string {
    const negative = this.isNegative();
    const absoluteValue = negative ? this.minorUnits.slice(1) : this.minorUnits;

    const padded = absoluteValue.padStart(3, '0');
    const integerPart = padded.slice(0, -2);
    const decimalPart = padded.slice(-2);

    return `${negative ? '-' : ''}${integerPart}.${decimalPart}`;
  }

  private static fromMinorUnits(minorUnits: string, currency: string): Money {
    return new Money(minorUnits, currency);
  }

  private static normalizeUnsigned(value: string): string {
    return value.replace(/^0+(?=\d)/, '');
  }

  private static compareUnsigned(a: string, b: string): number {
    const first = this.normalizeUnsigned(a);
    const second = this.normalizeUnsigned(b);

    if (first.length !== second.length) {
      return first.length < second.length ? -1 : 1;
    }

    if (first === second) {
      return 0;
    }

    return first < second ? -1 : 1;
  }

  private static addUnsigned(a: string, b: string): string {
    let carry = '0';
    let result = '';

    let i = a.length - 1;
    let j = b.length - 1;

    while (i >= 0 || j >= 0 || carry !== '0') {
      const digitA = i >= 0 ? a[i] : '0';
      const digitB = j >= 0 ? b[j] : '0';

      const sum = this.addDigits(digitA, digitB, carry);

      result = sum.digit + result;
      carry = sum.carry;

      i--;
      j--;
    }

    return this.normalizeUnsigned(result);
  }

  private static subtractUnsigned(a: string, b: string): string {
    let borrow = '0';
    let result = '';

    let i = a.length - 1;
    let j = b.length - 1;

    while (i >= 0) {
      const digitA = a[i];
      const digitB = j >= 0 ? b[j] : '0';

      const subtraction = this.subtractDigits(digitA, digitB, borrow);

      result = subtraction.digit + result;
      borrow = subtraction.borrow;

      i--;
      j--;
    }

    return this.normalizeUnsigned(result);
  }

  private static addDigits(
    a: string,
    b: string,
    carry: string,
  ): { digit: string; carry: string } {
    const values = '0123456789';
    const sum = values.indexOf(a) + values.indexOf(b) + values.indexOf(carry);

    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    if (sum >= 10) {
      return {
        digit: digits[sum - 10],
        carry: '1',
      };
    }

    return {
      digit: digits[sum],
      carry: '0',
    };
  }

  private static subtractDigits(
    a: string,
    b: string,
    borrow: string,
  ): { digit: string; borrow: string } {
    const values = '0123456789';

    let difference =
      values.indexOf(a) - values.indexOf(b) - values.indexOf(borrow);

    if (difference < 0) {
      difference += 10;

      return {
        digit: values[difference],
        borrow: '1',
      };
    }

    return {
      digit: values[difference],
      borrow: '0',
    };
  }

  private static addSigned(a: string, b: string): string {
    const negativeA = a.startsWith('-');
    const negativeB = b.startsWith('-');

    const absoluteA = negativeA ? a.slice(1) : a;
    const absoluteB = negativeB ? b.slice(1) : b;

    if (negativeA === negativeB) {
      const result = this.addUnsigned(absoluteA, absoluteB);

      return result === '0' ? '0' : negativeA ? `-${result}` : result;
    }

    const comparison = this.compareUnsigned(absoluteA, absoluteB);

    if (comparison === 0) {
      return '0';
    }

    if (comparison > 0) {
      const result = this.subtractUnsigned(absoluteA, absoluteB);

      return negativeA ? `-${result}` : result;
    }

    const result = this.subtractUnsigned(absoluteB, absoluteA);

    return negativeB ? `-${result}` : result;
  }

  private static negateValue(value: string): string {
    if (value === '0') {
      return '0';
    }

    return value.startsWith('-') ? value.slice(1) : `-${value}`;
  }

  private static compareSigned(a: string, b: string): number {
    const negativeA = a.startsWith('-');
    const negativeB = b.startsWith('-');

    if (negativeA !== negativeB) {
      return negativeA ? -1 : 1;
    }

    const absoluteA = negativeA ? a.slice(1) : a;
    const absoluteB = negativeB ? b.slice(1) : b;

    const comparison = this.compareUnsigned(absoluteA, absoluteB);

    return negativeA ? -comparison : comparison;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error('CURRENCY_MISMATCH');
    }
  }
}
