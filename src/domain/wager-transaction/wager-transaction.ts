import { Money } from '../shared/money.js';
import { LedgerDirection } from '../ledger/wallet-ledger-entry.js';

export enum WagerTransactionKind {
  Opening = 'OPENING',
  Bet = 'BET',
  Win = 'WIN',
  Loss = 'LOSS',
  Refund = 'REFUND',
  Rollback = 'ROLLBACK',
}

export enum WagerTransactionStatus {
  Pending = 'PENDING',
  PendingReference = 'PENDING_REFERENCE',
  Processed = 'PROCESSED',
  Rejected = 'REJECTED',
  Failed = 'FAILED',
}

export enum FailureCode {
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
  ReversalInsufficientFunds = 'REVERSAL_INSUFFICIENT_FUNDS',
  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  InvalidReference = 'INVALID_REFERENCE',
  ReferenceAmountMismatch = 'REFERENCE_AMOUNT_MISMATCH',
  DuplicateReversal = 'DUPLICATE_REVERSAL',
  InvalidTransaction = 'INVALID_TRANSACTION',
  ProcessingFailure = 'PROCESSING_FAILURE',
}

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt: Date;
}

export interface WagerTransactionState extends CreateWagerTransactionProps {
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    private readonly createdAtValue: Date,
    private currentStatus: WagerTransactionStatus,
    private currentReferenceTransactionId?: string,
    private currentFailureCode?: FailureCode,
    private currentProcessedAt?: Date,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    this.validate(props);

    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      new Date(props.createdAt.getTime()),
      WagerTransactionStatus.Pending,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      state.money,
      state.referenceExternalTransactionId,
      new Date(state.createdAt.getTime()),
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt ? new Date(state.processedAt.getTime()) : undefined,
    );
  }

  get status(): WagerTransactionStatus {
    return this.currentStatus;
  }

  get referenceTransactionId(): string | undefined {
    return this.currentReferenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this.currentFailureCode;
  }

  get processedAt(): Date | undefined {
    return this.currentProcessedAt
      ? new Date(this.currentProcessedAt.getTime())
      : undefined;
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  markProcessed(referenceTransactionId: string | undefined, at: Date): void {
    this.assertCanTransition();

    if (this.referenceExternalTransactionId && !referenceTransactionId) {
      throw new Error('REFERENCE_TRANSACTION_ID_REQUIRED');
    }

    if (!this.referenceExternalTransactionId && referenceTransactionId) {
      throw new Error('UNEXPECTED_REFERENCE_TRANSACTION_ID');
    }

    this.assertValidDate(at);

    this.currentStatus = WagerTransactionStatus.Processed;
    this.currentReferenceTransactionId = referenceTransactionId;
    this.currentProcessedAt = new Date(at.getTime());
    this.currentFailureCode = undefined;
  }

  markPendingReference(): void {
    this.assertCanTransition();

    if (!this.referenceExternalTransactionId) {
      throw new Error('REFERENCE_EXTERNAL_TRANSACTION_ID_REQUIRED');
    }

    this.currentStatus = WagerTransactionStatus.PendingReference;
  }

  reject(code: FailureCode): void {
    this.assertCanTransition();
    this.assertValidFailureCode(code);

    this.currentStatus = WagerTransactionStatus.Rejected;
    this.currentFailureCode = code;
  }

  fail(code: FailureCode): void {
    this.assertCanTransition();
    this.assertValidFailureCode(code);

    this.currentStatus = WagerTransactionStatus.Failed;
    this.currentFailureCode = code;
  }

  isTerminal(): boolean {
    return [
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Rejected,
      WagerTransactionStatus.Failed,
    ].includes(this.currentStatus);
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return [
      WagerTransactionKind.Refund,
      WagerTransactionKind.Rollback,
    ].includes(this.kind);
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    if (this.kind === WagerTransactionKind.Loss) {
      throw new Error('TRANSACTION_HAS_NO_LEDGER_ENTRY');
    }

    if (this.kind === WagerTransactionKind.Opening) {
      return LedgerDirection.Credit;
    }

    if (this.kind === WagerTransactionKind.Bet) {
      return LedgerDirection.Debit;
    }

    if (this.kind === WagerTransactionKind.Win) {
      if (reference) {
        this.validateReference(reference);
      } else if (this.referenceExternalTransactionId) {
        throw new Error('REFERENCE_TRANSACTION_REQUIRED');
      }

      return LedgerDirection.Credit;
    }

    if (this.kind === WagerTransactionKind.Refund) {
      this.validateReference(reference);

      return LedgerDirection.Credit;
    }

    if (this.kind === WagerTransactionKind.Rollback) {
      this.validateReference(reference);

      const referenceDirection =
        reference!.kind === WagerTransactionKind.Bet
          ? LedgerDirection.Debit
          : LedgerDirection.Credit;

      return referenceDirection === LedgerDirection.Debit
        ? LedgerDirection.Credit
        : LedgerDirection.Debit;
    }

    throw new Error('INVALID_TRANSACTION_KIND');
  }

  private validateReference(reference?: WagerTransaction): void {
    if (!reference || !this.referenceExternalTransactionId) {
      throw new Error('REFERENCE_TRANSACTION_REQUIRED');
    }

    if (
      reference.externalTransactionId !== this.referenceExternalTransactionId
    ) {
      throw new Error('INVALID_REFERENCE');
    }

    if (
      reference.status !== WagerTransactionStatus.Processed ||
      reference.providerId !== this.providerId ||
      reference.playerId !== this.playerId ||
      reference.walletId !== this.walletId ||
      reference.roundId !== this.roundId ||
      reference.money.currency !== this.money.currency
    ) {
      throw new Error('INVALID_REFERENCE');
    }

    if (!reference.money.equals(this.money)) {
      throw new Error('REFERENCE_AMOUNT_MISMATCH');
    }

    const allowedReferenceKinds: WagerTransactionKind[] =
      this.kind === WagerTransactionKind.Refund
        ? [WagerTransactionKind.Bet]
        : this.kind === WagerTransactionKind.Rollback
          ? [
              WagerTransactionKind.Bet,
              WagerTransactionKind.Win,
              WagerTransactionKind.Refund,
            ]
          : this.kind === WagerTransactionKind.Win
            ? [WagerTransactionKind.Bet]
            : [];

    if (!allowedReferenceKinds.includes(reference.kind)) {
      throw new Error('INVALID_REFERENCE');
    }
  }

  private static validate(props: CreateWagerTransactionProps): void {
    const requiredFields = [
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
    ];

    if (requiredFields.some((value) => !value?.trim())) {
      throw new Error('INVALID_TRANSACTION_IDENTIFICATION');
    }

    if (!Object.values(WagerTransactionKind).includes(props.kind)) {
      throw new Error('INVALID_TRANSACTION_KIND');
    }

    if (!props.money.isPositive()) {
      throw new Error('INVALID_TRANSACTION_AMOUNT');
    }

    if (
      !(props.createdAt instanceof Date) ||
      Number.isNaN(props.createdAt.getTime())
    ) {
      throw new Error('INVALID_TRANSACTION_DATE');
    }

    if (
      props.referenceExternalTransactionId !== undefined &&
      !props.referenceExternalTransactionId.trim()
    ) {
      throw new Error('INVALID_REFERENCE');
    }

    const requiresReference = [
      WagerTransactionKind.Refund,
      WagerTransactionKind.Rollback,
    ].includes(props.kind);

    if (requiresReference && !props.referenceExternalTransactionId) {
      throw new Error('REFERENCE_EXTERNAL_TRANSACTION_ID_REQUIRED');
    }

    const allowsReference = [
      WagerTransactionKind.Win,
      WagerTransactionKind.Refund,
      WagerTransactionKind.Rollback,
    ].includes(props.kind);

    if (props.referenceExternalTransactionId && !allowsReference) {
      throw new Error('UNEXPECTED_REFERENCE_EXTERNAL_TRANSACTION_ID');
    }
  }

  private assertCanTransition(): void {
    if (this.isTerminal()) {
      throw new Error('INVALID_TRANSACTION_STATE');
    }
  }

  private assertValidDate(date: Date): void {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new Error('INVALID_TRANSACTION_DATE');
    }
  }

  private assertValidFailureCode(code: FailureCode): void {
    if (!Object.values(FailureCode).includes(code)) {
      throw new Error('INVALID_FAILURE_CODE');
    }
  }
}
