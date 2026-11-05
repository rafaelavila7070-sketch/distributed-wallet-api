import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import { WalletLedgerRepository } from '../../../application/ports/wallet-ledger-repository.js';
import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../../domain/ledger/wallet-ledger-entry.js';
import { Money } from '../../../domain/shared/money.js';
import { WalletLedgerEntryEntity } from '../entities/wallet-ledger-entry.entity.js';

@Injectable()
export class MikroOrmWalletLedgerRepository implements WalletLedgerRepository {
  constructor(private readonly em: EntityManager) {}

  async findByTransactionId(
    transactionId: string,
  ): Promise<WalletLedgerEntry | null> {
    const entity = await this.em.findOne(WalletLedgerEntryEntity, {
      transactionId,
    });

    return entity ? this.toDomain(entity) : null;
  }

  async findByWalletId(walletId: string): Promise<WalletLedgerEntry[]> {
    const entities = await this.em.find(
      WalletLedgerEntryEntity,
      { walletId },
      { orderBy: { createdAt: 'ASC' } },
    );

    return entities.map((entity) => this.toDomain(entity));
  }

  async save(entry: WalletLedgerEntry): Promise<void> {
    const existing = await this.em.findOne(WalletLedgerEntryEntity, {
      id: entry.id,
    });

    if (existing) {
      throw new Error('LEDGER_ENTRY_ALREADY_EXISTS');
    }

    const entity = this.em.create(WalletLedgerEntryEntity, {
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      direction: entry.direction,
      amount: entry.money.toString(),
      currency: entry.money.currency,
      balanceBefore: entry.balanceBefore.toString(),
      balanceAfter: entry.balanceAfter.toString(),
      createdAt: entry.createdAt,
    });

    this.em.persist(entity);
    await this.em.flush();
  }

  private toDomain(entity: WalletLedgerEntryEntity): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction as LedgerDirection,
      money: Money.from({
        amount: entity.amount,
        currency: entity.currency,
      }),
      balanceBefore: Money.from({
        amount: entity.balanceBefore,
        currency: entity.currency,
      }),
      balanceAfter: Money.from({
        amount: entity.balanceAfter,
        currency: entity.currency,
      }),
      createdAt: entity.createdAt,
    });
  }
}
