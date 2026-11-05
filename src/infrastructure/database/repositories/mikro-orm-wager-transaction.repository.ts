import { Injectable } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';

import { WagerTransactionRepository } from '../../../application/ports/wager-transaction-repository.js';
import {
  FailureCode,
  WagerTransaction,
  WagerTransactionState,
  WagerTransactionStatus,
  WagerTransactionKind,
} from '../../../domain/wager-transaction/wager-transaction.js';
import { Money } from '../../../domain/shared/money.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';

@Injectable()
export class MikroOrmWagerTransactionRepository implements WagerTransactionRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { id });

    return entity ? this.toDomain(entity) : null;
  }

  async findByIdForUpdate(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(
      WagerTransactionEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
    );

    return entity ? this.toDomain(entity) : null;
  }

  async findByExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      providerId,
      externalTransactionId,
    });

    return entity ? this.toDomain(entity) : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      idempotencyKey,
    });

    return entity ? this.toDomain(entity) : null;
  }

  async findReversalForReference(
    referenceTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      referenceTransactionId,
      kind: {
        $in: [WagerTransactionKind.Refund, WagerTransactionKind.Rollback],
      },
    });

    return entity ? this.toDomain(entity) : null;
  }

  async save(transaction: WagerTransaction): Promise<void> {
    let entity = await this.em.findOne(WagerTransactionEntity, {
      id: transaction.id,
    });

    const data = {
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      idempotencyKey: transaction.idempotencyKey,
      payloadHash: transaction.payloadHash,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      amount: transaction.money.toString(),
      currency: transaction.money.currency,
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId,
      status: transaction.status,
      referenceTransactionId: transaction.referenceTransactionId,
      failureCode: transaction.failureCode,
      createdAt: transaction.createdAt,
      processedAt: transaction.processedAt,
    };

    if (!entity) {
      entity = this.em.create(WagerTransactionEntity, {
        id: transaction.id,
        ...data,
      });

      this.em.persist(entity);
    } else {
      Object.assign(entity, data);
    }

    await this.em.flush();
  }

  private toDomain(entity: WagerTransactionEntity): WagerTransaction {
    const state: WagerTransactionState = {
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind as WagerTransactionKind,
      money: Money.from({
        amount: entity.amount,
        currency: entity.currency,
      }),
      referenceExternalTransactionId: entity.referenceExternalTransactionId,
      status: entity.status as WagerTransactionStatus,
      referenceTransactionId: entity.referenceTransactionId,
      failureCode: entity.failureCode as FailureCode | undefined,
      createdAt: entity.createdAt,
      processedAt: entity.processedAt,
    };

    return WagerTransaction.rehydrate(state);
  }
}
