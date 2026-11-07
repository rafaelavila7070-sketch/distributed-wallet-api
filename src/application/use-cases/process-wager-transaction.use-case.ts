import { createHash, randomUUID } from 'node:crypto';

import { Money } from '../../domain/shared/money.js';

import {
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wager-transaction/wager-transaction.js';

import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../domain/ledger/wallet-ledger-entry.js';

import { ApplicationError } from '../errors/application-error.js';

import type {
  WalletRepositories,
  WalletUnitOfWork,
} from '../ports/wallet-unit-of-work.js';

import type { Wallet } from '../../domain/wallet/wallet.js';

import { requestContext } from '../../infrastructure/logging/request-context.js';

export interface ProcessWagerTransactionCommand {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  playerId: string;
  currency: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  amount: string;
  referenceExternalTransactionId?: string;
  walletId?: string;
}

export interface InboxMessageMetadata {
  consumerName: string;
  messageId: string;
  payloadHash: string;
}

export type InboxProcessingResult =
  | {
      status: 'DUPLICATE_MESSAGE';
    }
  | {
      status: 'PROCESSED_MESSAGE';
      transaction: WagerTransaction;
    };

export class ProcessWagerTransactionUseCase {
  constructor(private readonly unitOfWork: WalletUnitOfWork) {}

  getById(id: string): Promise<WagerTransaction> {
    return this.unitOfWork.execute(async ({ transactions }) => {
      const transaction = await transactions.findById(id);

      if (!transaction) {
        throw new ApplicationError('TRANSACTION_NOT_FOUND', 404);
      }

      return transaction;
    });
  }

  async execute(
    command: ProcessWagerTransactionCommand,
  ): Promise<WagerTransaction> {
    const normalized = this.normalize(command);
    const money = this.parseMoney(normalized.amount, normalized.currency);
    const payloadHash = this.createTransactionPayloadHash(
      normalized,
      money,
    );

    try {
      return await this.unitOfWork.execute((repositories) =>
        this.processWithinUnitOfWork(
          normalized,
          money,
          payloadHash,
          repositories,
        ),
      );
    } catch (error) {
      this.handleUniqueViolation(error);
      throw error;
    }
  }

  async executeFromMessage(
    command: ProcessWagerTransactionCommand,
    metadata: InboxMessageMetadata,
  ): Promise<InboxProcessingResult> {
    if (
      !metadata ||
      typeof metadata.consumerName !== 'string' ||
      !metadata.consumerName.trim() ||
      typeof metadata.messageId !== 'string' ||
      !metadata.messageId.trim() ||
      typeof metadata.payloadHash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(metadata.payloadHash)
    ) {
      throw new ApplicationError('INVALID_INBOX_MESSAGE', 400);
    }

    const normalized = this.normalize(command);

    if (normalized.kind === WagerTransactionKind.Opening) {
      throw new ApplicationError('OPENING_TRANSACTION_NOT_ALLOWED', 400);
    }

    if (!normalized.walletId) {
      throw new ApplicationError('WALLET_ID_REQUIRED', 400);
    }

    const money = this.parseMoney(normalized.amount, normalized.currency);

    const transactionPayloadHash = this.createTransactionPayloadHash(
      normalized,
      money,
    );

    try {
      return await this.unitOfWork.execute(async (repositories) => {
        const registration = await repositories.inbox.register({
          consumerName: metadata.consumerName,
          messageId: metadata.messageId,
          payloadHash: metadata.payloadHash,
        });

        if (registration === 'DUPLICATE') {
          return {
            status: 'DUPLICATE_MESSAGE',
          };
        }

        if (registration === 'PAYLOAD_CONFLICT') {
          throw new ApplicationError(
            'INBOX_MESSAGE_PAYLOAD_CONFLICT',
            409,
          );
        }

        const transaction = await this.processWithinUnitOfWork(
          normalized,
          money,
          transactionPayloadHash,
          repositories,
        );

        await repositories.inbox.markProcessed(
          metadata.consumerName,
          metadata.messageId,
        );

        return {
          status: 'PROCESSED_MESSAGE',
          transaction,
        };
      });
    } catch (error) {
      this.handleUniqueViolation(error);
      throw error;
    }
  }

  private async processWithinUnitOfWork(
    normalized: ProcessWagerTransactionCommand,
    money: Money,
    payloadHash: string,
    repositories: WalletRepositories,
  ): Promise<WagerTransaction> {
    const { wallets, transactions } = repositories;

    const existingByKey = await transactions.findByIdempotencyKey(
      normalized.idempotencyKey,
    );

    if (existingByKey) {
      if (!existingByKey.matchesPayload(payloadHash)) {
        throw new ApplicationError('IDEMPOTENCY_KEY_REUSED', 409);
      }

      if (
        existingByKey.status !== WagerTransactionStatus.PendingReference
      ) {
        return existingByKey;
      }

      return this.resumePending(existingByKey, repositories);
    }

    const existingByExternalId =
      await transactions.findByExternalTransactionId(
        normalized.providerId,
        normalized.externalTransactionId,
      );

    if (existingByExternalId) {
      if (!existingByExternalId.matchesPayload(payloadHash)) {
        throw new ApplicationError(
          'EXTERNAL_TRANSACTION_ID_REUSED',
          409,
        );
      }

      if (
        existingByExternalId.status ===
        WagerTransactionStatus.PendingReference
      ) {
        return this.resumePending(existingByExternalId, repositories);
      }

      return existingByExternalId;
    }

    const wallet = normalized.walletId
      ? await wallets.findById(normalized.walletId, true)
      : await wallets.findByPlayerIdAndCurrency(
          normalized.playerId,
          normalized.currency,
          true,
        );

    if (!wallet) {
      throw new ApplicationError('WALLET_NOT_FOUND', 404);
    }

    this.validateWallet(wallet, normalized);

    // Recheck after acquiring the wallet lock.
    const concurrentByKey = await transactions.findByIdempotencyKey(
      normalized.idempotencyKey,
    );

    if (concurrentByKey) {
      if (!concurrentByKey.matchesPayload(payloadHash)) {
        throw new ApplicationError('IDEMPOTENCY_KEY_REUSED', 409);
      }

      if (
        concurrentByKey.status !== WagerTransactionStatus.PendingReference
      ) {
        return concurrentByKey;
      }

      return this.resumePending(
        concurrentByKey,
        repositories,
        wallet,
      );
    }

    const concurrentByExternalId =
      await transactions.findByExternalTransactionId(
        normalized.providerId,
        normalized.externalTransactionId,
      );

    if (concurrentByExternalId) {
      if (!concurrentByExternalId.matchesPayload(payloadHash)) {
        throw new ApplicationError(
          'EXTERNAL_TRANSACTION_ID_REUSED',
          409,
        );
      }

      if (
        concurrentByExternalId.status ===
        WagerTransactionStatus.PendingReference
      ) {
        return this.resumePending(
          concurrentByExternalId,
          repositories,
          wallet,
        );
      }

      return concurrentByExternalId;
    }

    const transaction = WagerTransaction.create({
      id: randomUUID(),
      providerId: normalized.providerId,
      externalTransactionId: normalized.externalTransactionId,
      idempotencyKey: normalized.idempotencyKey,
      payloadHash,
      walletId: wallet.id,
      playerId: normalized.playerId,
      roundId: normalized.roundId,
      gameId: normalized.gameId,
      kind: normalized.kind,
      money,
      referenceExternalTransactionId:
        normalized.referenceExternalTransactionId,
      createdAt: new Date(),
    });

    await transactions.save(transaction);

    return this.processExisting(
      transaction,
      repositories,
      wallet,
    );
  }

  private validateWallet(
    wallet: Wallet,
    command: ProcessWagerTransactionCommand,
  ): void {
    if (wallet.playerId !== command.playerId) {
      throw new ApplicationError('WALLET_PLAYER_MISMATCH', 400);
    }

    if (wallet.balance.currency !== command.currency) {
      throw new ApplicationError('WALLET_CURRENCY_MISMATCH', 400);
    }
  }

  private createTransactionPayloadHash(
    command: ProcessWagerTransactionCommand,
    money: Money,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          providerId: command.providerId,
          externalTransactionId: command.externalTransactionId,
          playerId: command.playerId,
          walletId: command.walletId ?? null,
          currency: command.currency,
          roundId: command.roundId,
          gameId: command.gameId,
          kind: command.kind,
          amount: money.toString(),
          referenceExternalTransactionId:
            command.referenceExternalTransactionId,
        }),
      )
      .digest('hex');
  }

  private handleUniqueViolation(error: unknown): void {
    if (this.isUniqueViolation(error)) {
      throw new ApplicationError('TRANSACTION_ALREADY_EXISTS', 409);
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as {
      code?: string;
      cause?: { code?: string };
    };

    return (
      candidate.code === '23505' ||
      candidate.cause?.code === '23505'
    );
  }

  private async resumePending(
    transaction: WagerTransaction,
    repositories: WalletRepositories,
    knownWallet?: Wallet,
  ): Promise<WagerTransaction> {
    const wallet =
      knownWallet ??
      (await repositories.wallets.findById(transaction.walletId, true));

    if (!wallet) {
      throw new ApplicationError('WALLET_NOT_FOUND', 404);
    }

    const refreshed = await repositories.transactions.findByIdForUpdate(
      transaction.id,
    );

    if (!refreshed) {
      throw new ApplicationError('TRANSACTION_NOT_FOUND', 404);
    }

    if (refreshed.status !== WagerTransactionStatus.PendingReference) {
      return refreshed;
    }

    return this.processExisting(refreshed, repositories, wallet);
  }

  private async processExisting(
    transaction: WagerTransaction,
    repositories: WalletRepositories,
    knownWallet?: Wallet,
  ): Promise<WagerTransaction> {
    const { wallets, transactions, ledger, outbox } = repositories;

    const previousStatus = transaction.status;

    const wallet =
      knownWallet ??
      (await wallets.findById(transaction.walletId, true));

    if (!wallet) {
      throw new ApplicationError('WALLET_NOT_FOUND', 404);
    }

    if (transaction.kind === WagerTransactionKind.Loss) {
      transaction.markProcessed(undefined, new Date());

      await transactions.save(transaction);

      await this.recordOutcome(transaction, previousStatus, outbox);

      return transaction;
    }

    let reference: WagerTransaction | undefined;

    if (transaction.referenceExternalTransactionId) {
      const found = await transactions.findByExternalTransactionId(
        transaction.providerId,
        transaction.referenceExternalTransactionId,
      );

      if (!found) {
        if (transaction.status !== WagerTransactionStatus.PendingReference) {
          transaction.markPendingReference();
        }

        await transactions.save(transaction);

        await this.recordOutcome(transaction, previousStatus, outbox);

        return transaction;
      }

      reference = found;
    }

    if (transaction.requiresReference() && !reference) {
      transaction.markPendingReference();

      await transactions.save(transaction);

      await this.recordOutcome(transaction, previousStatus, outbox);

      return transaction;
    }

    if (
      transaction.kind === WagerTransactionKind.Refund ||
      transaction.kind === WagerTransactionKind.Rollback
    ) {
      const alreadyReversed =
        await transactions.findReversalForReference(reference!.id);

      if (alreadyReversed) {
        transaction.reject(FailureCode.DuplicateReversal);

        await transactions.save(transaction);

        await this.recordOutcome(transaction, previousStatus, outbox);

        return transaction;
      }
    }

    let direction: LedgerDirection;

    try {
      direction = transaction.ledgerDirectionFor(reference);
    } catch (error) {
      const code =
        error instanceof Error ? error.message : 'INVALID_REFERENCE';

      transaction.reject(this.toFailureCode(code));

      await transactions.save(transaction);

      await this.recordOutcome(transaction, previousStatus, outbox);

      return transaction;
    }

    const balanceBefore = wallet.balance;

    try {
      if (direction === LedgerDirection.Debit) {
        wallet.debit(transaction.money);
      } else {
        wallet.credit(transaction.money);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'INSUFFICIENT_FUNDS'
      ) {
        transaction.reject(FailureCode.InsufficientFunds);

        await transactions.save(transaction);

        await this.recordOutcome(transaction, previousStatus, outbox);

        return transaction;
      }

      throw error;
    }

    const ledgerEntry = WalletLedgerEntry.create({
      id: randomUUID(),
      walletId: wallet.id,
      transactionId: transaction.id,
      direction,
      money: transaction.money,
      balanceBefore,
      balanceAfter: wallet.balance,
      createdAt: new Date(),
    });

    transaction.markProcessed(reference?.id, new Date());

    await wallets.save(wallet);
    await ledger.save(ledgerEntry);
    await transactions.save(transaction);

    await this.recordOutcome(transaction, previousStatus, outbox);

    return transaction;
  }

  private async recordOutcome(
    transaction: WagerTransaction,
    previousStatus: WagerTransactionStatus,
    outbox: WalletRepositories['outbox'],
  ): Promise<void> {
    if (transaction.status === previousStatus) {
      return;
    }

    const eventId = `${transaction.id}:${transaction.status}`;

    await outbox.save({
      eventId,
      aggregateType: 'WagerTransaction',
      aggregateId: transaction.id,
      eventType: `wager.transaction.${transaction.status.toLowerCase()}`,
      createdAt: new Date(),
      payload: {
        correlationId: requestContext.getStore()?.correlationId ?? null,
        transactionId: transaction.id,
        providerId: transaction.providerId,
        externalTransactionId: transaction.externalTransactionId,
        walletId: transaction.walletId,
        playerId: transaction.playerId,
        roundId: transaction.roundId,
        gameId: transaction.gameId,
        kind: transaction.kind,
        status: transaction.status,
        amount: transaction.money.toString(),
        currency: transaction.money.currency,
        referenceTransactionId:
          transaction.referenceTransactionId ?? null,
        failureCode: transaction.failureCode ?? null,
        transactionCreatedAt: transaction.createdAt,
        processedAt: transaction.processedAt ?? null,
      },
    });
  }

  private normalize(
    command: ProcessWagerTransactionCommand,
  ): ProcessWagerTransactionCommand {
    const normalized: ProcessWagerTransactionCommand = {
      providerId:
        typeof command?.providerId === 'string'
          ? command.providerId.trim()
          : '',

      externalTransactionId:
        typeof command?.externalTransactionId === 'string'
          ? command.externalTransactionId.trim()
          : '',

      idempotencyKey:
        typeof command?.idempotencyKey === 'string'
          ? command.idempotencyKey.trim()
          : '',

      playerId:
        typeof command?.playerId === 'string'
          ? command.playerId.trim()
          : '',

      currency:
        typeof command?.currency === 'string'
          ? command.currency.trim().toUpperCase()
          : '',

      roundId:
        typeof command?.roundId === 'string'
          ? command.roundId.trim()
          : '',

      gameId:
        typeof command?.gameId === 'string'
          ? command.gameId.trim()
          : '',

      kind: command?.kind,

      amount:
        typeof command?.amount === 'string'
          ? command.amount.trim()
          : '',

      walletId:
        typeof command?.walletId === 'string'
          ? command.walletId.trim() || undefined
          : undefined,

      referenceExternalTransactionId:
        typeof command?.referenceExternalTransactionId === 'string'
          ? command.referenceExternalTransactionId.trim() || undefined
          : undefined,
    };

    const required = [
      normalized.providerId,
      normalized.externalTransactionId,
      normalized.idempotencyKey,
      normalized.playerId,
      normalized.currency,
      normalized.roundId,
      normalized.gameId,
      normalized.amount,
    ];

    if (
      required.some((value) => !value) ||
      normalized.providerId.length > 100 ||
      normalized.externalTransactionId.length > 150 ||
      normalized.idempotencyKey.length > 150 ||
      normalized.playerId.length > 100 ||
      normalized.roundId.length > 150 ||
      normalized.gameId.length > 150 ||
      (normalized.walletId?.length ?? 0) > 100 ||
      (normalized.referenceExternalTransactionId?.length ?? 0) > 150
    ) {
      throw new ApplicationError('INVALID_TRANSACTION_REQUEST', 400);
    }

    if (!Object.values(WagerTransactionKind).includes(normalized.kind)) {
      throw new ApplicationError('INVALID_TRANSACTION_KIND', 400);
    }

    return normalized;
  }

  private parseMoney(amount: string, currency: string): Money {
    try {
      const money = Money.from({ amount, currency });

      if (!money.isPositive() || money.toString().length > 40) {
        throw new Error('INVALID_TRANSACTION_AMOUNT');
      }

      return money;
    } catch {
      throw new ApplicationError(
        'INVALID_TRANSACTION_AMOUNT_OR_CURRENCY',
        400,
      );
    }
  }

  private toFailureCode(code: string): FailureCode {
    const known = Object.values(FailureCode) as string[];

    return known.includes(code)
      ? (code as FailureCode)
      : FailureCode.InvalidReference;
  }
}