
import { describe, expect, it } from 'bun:test';

import { Wallet } from '../../domain/wallet/wallet.js';
import {
  WagerTransactionKind,
  WagerTransaction,
} from '../../domain/wager-transaction/wager-transaction.js';
import { WalletLedgerEntry } from '../../domain/ledger/wallet-ledger-entry.js';

import type {
  WalletRepositories,
  WalletUnitOfWork,
} from '../ports/wallet-unit-of-work.js';

import type { WalletRepository } from '../ports/wallet-repository.js';
import type { WagerTransactionRepository } from '../ports/wager-transaction-repository.js';
import type { WalletLedgerRepository } from '../ports/wallet-ledger-repository.js';
import type {
  CreateOutboxEvent,
  OutboxEventRepository,
} from '../ports/outbox-event-repository.js';
import type { InboxMessageRepository } from '../ports/inbox-message-repository.js';

import { CreateWalletUseCase } from './create-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case.js';
import { requestContext } from '../../infrastructure/logging/request-context.js';

class InMemoryUnitOfWork implements WalletUnitOfWork {
  readonly wallets = new Map<string, Wallet>();
  readonly transactions = new Map<string, WagerTransaction>();
  readonly ledger = new Map<string, WalletLedgerEntry>();
  readonly outbox = new Map<string, CreateOutboxEvent>();

  readonly inbox = new Map<
    string,
    {
      payloadHash: string;
      processedAt: Date | null;
    }
  >();

  private readonly walletRepository: WalletRepository = {
    findById: async (id) => this.wallets.get(id) ?? null,

    findByPlayerIdAndCurrency: async (playerId, currency) =>
      [...this.wallets.values()].find(
        (wallet) =>
          wallet.playerId === playerId &&
          wallet.balance.currency === currency,
      ) ?? null,

    save: async (wallet) => {
      this.wallets.set(wallet.id, wallet);
    },
  };

  private readonly transactionRepository: WagerTransactionRepository = {
    findById: async (id) => this.transactions.get(id) ?? null,

    findByIdForUpdate: async (id) => this.transactions.get(id) ?? null,

    findByExternalTransactionId: async (providerId, externalId) =>
      [...this.transactions.values()].find(
        (transaction) =>
          transaction.providerId === providerId &&
          transaction.externalTransactionId === externalId,
      ) ?? null,

    findByIdempotencyKey: async (key) =>
      [...this.transactions.values()].find(
        (transaction) => transaction.idempotencyKey === key,
      ) ?? null,

    findReversalForReference: async (referenceId) =>
      [...this.transactions.values()].find(
        (transaction) =>
          transaction.referenceTransactionId === referenceId &&
          [
            WagerTransactionKind.Refund,
            WagerTransactionKind.Rollback,
          ].includes(transaction.kind),
      ) ?? null,

    save: async (transaction) => {
      this.transactions.set(transaction.id, transaction);
    },
  };

  private readonly ledgerRepository: WalletLedgerRepository = {
    findByTransactionId: async (transactionId) =>
      [...this.ledger.values()].find(
        (entry) => entry.transactionId === transactionId,
      ) ?? null,

    findByWalletId: async (walletId) =>
      [...this.ledger.values()].filter(
        (entry) => entry.walletId === walletId,
      ),

    save: async (entry) => {
      this.ledger.set(entry.id, entry);
    },
  };

  private readonly outboxRepository: OutboxEventRepository = {
    save: async (event) => {
      this.outbox.set(event.eventId, event);
    },
  };

  private readonly inboxRepository: InboxMessageRepository = {
    register: async (message) => {
      const key = JSON.stringify([
        message.consumerName,
        message.messageId,
      ]);

      const existing = this.inbox.get(key);

      if (!existing) {
        this.inbox.set(key, {
          payloadHash: message.payloadHash,
          processedAt: null,
        });

        return 'REGISTERED';
      }

      return existing.payloadHash === message.payloadHash
        ? 'DUPLICATE'
        : 'PAYLOAD_CONFLICT';
    },

    markProcessed: async (
      consumerName,
      messageId,
      processedAt = new Date(),
    ) => {
      const key = JSON.stringify([consumerName, messageId]);
      const message = this.inbox.get(key);

      if (!message || message.processedAt !== null) {
        throw new Error(
          'Não foi possível marcar a mensagem como processada na Inbox.',
        );
      }

      message.processedAt = processedAt;
    },
  };

  async execute<T>(
    work: (repositories: WalletRepositories) => Promise<T>,
  ): Promise<T> {
    return work({
      wallets: this.walletRepository,
      transactions: this.transactionRepository,
      ledger: this.ledgerRepository,
      outbox: this.outboxRepository,
      inbox: this.inboxRepository,
    });
  }
}

describe('ProcessWagerTransactionUseCase', () => {
  const setup = async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const createWallet = new CreateWalletUseCase(unitOfWork);
    const process = new ProcessWagerTransactionUseCase(unitOfWork);

    const wallet = await createWallet.execute({
      playerId: 'player-1',
      currency: 'BRL',
    });

    return { unitOfWork, process, wallet };
  };

  const command = (
    kind: WagerTransactionKind,
    externalTransactionId: string,
    amount: string,
    extra: Partial<{
      referenceExternalTransactionId: string;
      idempotencyKey: string;
    }> = {},
  ) => ({
    providerId: 'provider-1',
    externalTransactionId,
    idempotencyKey: extra.idempotencyKey ?? `key-${externalTransactionId}`,
    playerId: 'player-1',
    currency: 'BRL',
    roundId: 'round-1',
    gameId: 'game-1',
    kind,
    amount,
    ...('referenceExternalTransactionId' in extra
      ? {
          referenceExternalTransactionId:
            extra.referenceExternalTransactionId,
        }
      : {}),
  });

  const inboxMetadata = (
    messageId: string,
    payloadHash = 'a'.repeat(64),
  ) => ({
    consumerName: 'wager-transaction-consumer',
    messageId,
    payloadHash,
  });

  it('creates a wallet with zero balance', async () => {
    const { wallet } = await setup();

    expect(wallet.balance.toString()).toBe('0.00');
    expect(wallet.version).toBe(1);
  });

  it('credits opening and debits a bet with ledger entries', async () => {
    const { unitOfWork, process } = await setup();

    const opening = await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    const bet = await process.execute(
      command(WagerTransactionKind.Bet, 'bet-1', '30.00'),
    );

    const wallet = [...unitOfWork.wallets.values()][0];

    expect(opening.status).toBe('PROCESSED');
    expect(bet.status).toBe('PROCESSED');
    expect(wallet.balance.toString()).toBe('70.00');
    expect(unitOfWork.ledger.size).toBe(2);
  });

  it('propagates the correlation ID to the outbox event', async () => {
    const { unitOfWork, process } = await setup();
    const correlationId = 'test-correlation-123';

    const opening = await requestContext.run(
      { correlationId },
      () =>
        process.execute(
          command(
            WagerTransactionKind.Opening,
            'opening-correlation-1',
            '100.00',
          ),
        ),
    );

    const event = [...unitOfWork.outbox.values()].find(
      (outboxEvent) => outboxEvent.aggregateId === opening.id,
    );

    expect(event).toBeDefined();
    expect(event?.payload).toMatchObject({ correlationId });
  });

  it('does not apply the same idempotent transaction twice', async () => {
    const { unitOfWork, process } = await setup();

    const openingCommand = command(
      WagerTransactionKind.Opening,
      'opening-1',
      '100.00',
    );

    await process.execute(openingCommand);

    const replay = await process.execute(openingCommand);

    expect(replay.status).toBe('PROCESSED');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '100.00',
    );
    expect(unitOfWork.ledger.size).toBe(1);
  });

  it('rejects a bet when funds are insufficient', async () => {
    const { unitOfWork, process } = await setup();

    const bet = await process.execute(
      command(WagerTransactionKind.Bet, 'bet-1', '10.00'),
    );

    expect(bet.status).toBe('REJECTED');
    expect(bet.failureCode).toBe('INSUFFICIENT_FUNDS');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '0.00',
    );
    expect(unitOfWork.ledger.size).toBe(0);
  });

  it('records loss without changing the balance', async () => {
    const { unitOfWork, process } = await setup();

    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    const loss = await process.execute(
      command(WagerTransactionKind.Loss, 'loss-1', '100.00'),
    );

    expect(loss.status).toBe('PROCESSED');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '100.00',
    );
    expect(unitOfWork.ledger.size).toBe(1);
  });

  it('keeps a refund pending until its reference arrives, then retries it', async () => {
    const { unitOfWork, process } = await setup();

    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    const refundCommand = command(
      WagerTransactionKind.Refund,
      'refund-1',
      '25.00',
      { referenceExternalTransactionId: 'bet-1' },
    );

    const pending = await process.execute(refundCommand);

    expect(pending.status).toBe('PENDING_REFERENCE');

    await process.execute(
      command(WagerTransactionKind.Bet, 'bet-1', '25.00'),
    );

    const refund = await process.execute(refundCommand);

    expect(refund.status).toBe('PROCESSED');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '100.00',
    );
  });

  it('rejects a second reversal for the same reference transaction', async () => {
    const { process, unitOfWork } = await setup();

    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    await process.execute(
      command(WagerTransactionKind.Bet, 'bet-1', '20.00'),
    );

    const firstRefund = await process.execute(
      command(WagerTransactionKind.Refund, 'refund-1', '20.00', {
        referenceExternalTransactionId: 'bet-1',
      }),
    );

    const secondRefund = await process.execute(
      command(WagerTransactionKind.Refund, 'refund-2', '20.00', {
        referenceExternalTransactionId: 'bet-1',
      }),
    );

    expect(firstRefund.status).toBe('PROCESSED');
    expect(secondRefund.status).toBe('REJECTED');
    expect(secondRefund.failureCode).toBe('DUPLICATE_REVERSAL');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '100.00',
    );
  });

  it('rejects reusing an idempotency key with a different payload', async () => {
    const { process } = await setup();

    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    await expect(
      process.execute({
        ...command(WagerTransactionKind.Bet, 'bet-1', '10.00'),
        idempotencyKey: 'shared-key',
      }),
    ).resolves.toBeDefined();

    await expect(
      process.execute({
        ...command(WagerTransactionKind.Bet, 'bet-2', '20.00'),
        idempotencyKey: 'shared-key',
      }),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
  });

  it('registers and processes the first incoming message', async () => {
    const { unitOfWork, process, wallet } = await setup();

    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    const result = await process.executeFromMessage(
      {
        ...command(WagerTransactionKind.Bet, 'bet-message-1', '30.00'),
        walletId: wallet.id,
      },
      inboxMetadata('message-1'),
    );

    const inboxMessage = unitOfWork.inbox.get(
      JSON.stringify(['wager-transaction-consumer', 'message-1']),
    );

    expect(result.status).toBe('PROCESSED_MESSAGE');

    if (result.status === 'PROCESSED_MESSAGE') {
      expect(result.transaction.status).toBe('PROCESSED');
    }

    expect(inboxMessage).toBeDefined();
    expect(inboxMessage?.processedAt).toBeInstanceOf(Date);
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '70.00',
    );
    expect(unitOfWork.ledger.size).toBe(2);
  });

  it('does not apply the financial operation twice when a message is redelivered', async () => {
    const { unitOfWork, process, wallet } = await setup();

    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-1', '100.00'),
    );

    const messageCommand = {
      ...command(WagerTransactionKind.Bet, 'bet-message-1', '30.00'),
      walletId: wallet.id,
    };

    const metadata = inboxMetadata('message-1');

    const firstResult = await process.executeFromMessage(
      messageCommand,
      metadata,
    );

    const secondResult = await process.executeFromMessage(
      messageCommand,
      metadata,
    );

    expect(firstResult.status).toBe('PROCESSED_MESSAGE');
    expect(secondResult.status).toBe('DUPLICATE_MESSAGE');
    expect([...unitOfWork.wallets.values()][0].balance.toString()).toBe(
      '70.00',
    );
    expect(unitOfWork.ledger.size).toBe(2);
    expect(unitOfWork.transactions.size).toBe(2);
  });

  it('rejects the same message ID with a different payload hash', async () => {
    const { process, wallet } = await setup();

    const messageCommand = {
      ...command(WagerTransactionKind.Bet, 'bet-message-1', '30.00'),
      walletId: wallet.id,
    };

    await process.executeFromMessage(
      messageCommand,
      inboxMetadata('message-1', 'a'.repeat(64)),
    );

    await expect(
      process.executeFromMessage(
        messageCommand,
        inboxMetadata('message-1', 'b'.repeat(64)),
      ),
    ).rejects.toThrow('INBOX_MESSAGE_PAYLOAD_CONFLICT');
  });

  it('rejects a message when the wallet does not exist', async () => {
    const { process } = await setup();

    await expect(
      process.executeFromMessage(
        {
          ...command(WagerTransactionKind.Bet, 'bet-message-1', '30.00'),
          walletId: '00000000-0000-0000-0000-000000000000',
        },
        inboxMetadata('message-1'),
      ),
    ).rejects.toThrow('WALLET_NOT_FOUND');
  });

  it('rejects a message when the wallet belongs to another player', async () => {
    const { process, wallet } = await setup();

    await expect(
      process.executeFromMessage(
        {
          ...command(WagerTransactionKind.Bet, 'bet-message-1', '30.00'),
          playerId: 'player-2',
          walletId: wallet.id,
        },
        inboxMetadata('message-1'),
      ),
    ).rejects.toThrow('WALLET_PLAYER_MISMATCH');
  });

  it('does not allow opening transactions through incoming messages', async () => {
    const { process, wallet } = await setup();

    await expect(
      process.executeFromMessage(
        {
          ...command(
            WagerTransactionKind.Opening,
            'opening-message-1',
            '100.00',
          ),
          walletId: wallet.id,
        },
        inboxMetadata('message-1'),
      ),
    ).rejects.toThrow('OPENING_TRANSACTION_NOT_ALLOWED');
  });

  it('creates a wallet with initial balance and records the opening transaction atomically', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const createWallet = new CreateWalletUseCase(unitOfWork);

    const wallet = await createWallet.execute({
      playerId: 'player-opening',
      currency: 'BRL',
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const opening = [...unitOfWork.transactions.values()][0];
    const ledgerEntry = [...unitOfWork.ledger.values()][0];

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(2);

    expect(unitOfWork.transactions.size).toBe(1);
    expect(opening.kind).toBe(WagerTransactionKind.Opening);
    expect(opening.status).toBe('PROCESSED');

    expect(unitOfWork.ledger.size).toBe(1);
    expect(ledgerEntry.direction).toBe('CREDIT');
    expect(ledgerEntry.balanceBefore.toString()).toBe('0.00');
    expect(ledgerEntry.balanceAfter.toString()).toBe('100.00');

    expect(unitOfWork.outbox.size).toBe(2);
  });

  it('processes 50 concurrent bets without losing balance updates', async () => {
    const { unitOfWork, process } = await setup();

    await process.execute(
      command(WagerTransactionKind.Opening, 'opening-concurrent', '100.00'),
    );

    const operations = Array.from({ length: 50 }, (_, index) =>
      process.execute(
        command(
          WagerTransactionKind.Bet,
          `bet-concurrent-${index + 1}`,
          '1.00',
        ),
      ),
    );

    const results = await Promise.all(operations);

    const wallet = [...unitOfWork.wallets.values()][0];

    expect(results).toHaveLength(50);

    expect(results.every((result) => result.status === 'PROCESSED')).toBe(
      true,
    );

    expect(wallet.balance.toString()).toBe('50.00');

    expect(unitOfWork.transactions.size).toBe(51);

    expect(unitOfWork.ledger.size).toBe(51);
  });

  it('creates a zero-balance wallet without an opening transaction', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const createWallet = new CreateWalletUseCase(unitOfWork);

    const wallet = await createWallet.execute({
      playerId: 'player-zero',
      currency: 'BRL',
      initialBalance: {
        amount: '0.00',
        currency: 'BRL',
      },
    });

    expect(wallet.balance.toString()).toBe('0.00');
    expect(wallet.version).toBe(1);
    expect(unitOfWork.transactions.size).toBe(0);
    expect(unitOfWork.ledger.size).toBe(0);
    expect(unitOfWork.outbox.size).toBe(0);
  });
});
