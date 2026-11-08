import { describe, expect, it, mock } from 'bun:test';

import { SendMessageCommand } from '@aws-sdk/client-sqs';

import { OutboxPublisherService } from './outbox-publisher.service.js';

describe('OutboxPublisherService', () => {
  it('publishes pending events and marks them as published', async () => {
    const event = {
      id: 'outbox-event-001',
      event_id: 'wallet-credited-001',
      event_type: 'WalletCredited',
      payload: {
        walletId: 'wallet-001',
        correlationId: 'correlation-001',
      },
      created_at: new Date('2026-11-08T00:00:00.000Z'),
      attempts: 0,
    };

    const execute = mock(async (sql: string) => {
      if (sql.includes('with candidates')) {
        return [event];
      }

      return [];
    });

    const em = {
      getConnection: () => ({ execute }),
    };

    const send = mock(async () => ({
      MessageId: 'sqs-message-001',
    }));

    const sqs = {
      send,
      destroy: mock(() => undefined),
    };

    const service = new OutboxPublisherService(
      em as never,
      sqs as never,
    );

    (
      service as unknown as { queueUrl: string }
    ).queueUrl = 'http://localhost:4566/000000000000/wager-events';

    const published = await service.publishPendingEvents();

    expect(published).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);

    const sentCommand = send.mock.calls[0][0];

    expect(sentCommand).toBeInstanceOf(SendMessageCommand);

    const message = JSON.parse(
      (sentCommand as SendMessageCommand).input.MessageBody!,
    );

    expect(message.eventId).toBe('wallet-credited-001');
    expect(message.type).toBe('WalletCredited');
    expect(message.data.walletId).toBe('wallet-001');

    const confirmationCall = execute.mock.calls[1];

    expect(confirmationCall[0]).toContain('published_at = now()');
  });
  it('schedules a retry when SQS publication fails', async () => {
  const event = {
    id: 'outbox-event-002',
    event_id: 'wallet-debited-002',
    event_type: 'WalletDebited',
    payload: {
      walletId: 'wallet-002',
    },
    created_at: new Date('2026-11-08T00:00:00.000Z'),
    attempts: 0,
  };

  const execute = mock(async (sql: string) => {
    if (sql.includes('with candidates')) {
      return [event];
    }

    return [];
  });

  const em = {
    getConnection: () => ({ execute }),
  };

  const send = mock(async () => {
    throw new Error('SQS unavailable');
  });

  const sqs = {
    send,
    destroy: mock(() => undefined),
  };

  const service = new OutboxPublisherService(
    em as never,
    sqs as never,
  );

  (
    service as unknown as { queueUrl: string }
  ).queueUrl = 'http://localhost:4566/000000000000/wager-events';

  const published = await service.publishPendingEvents();

  expect(published).toBe(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(2);

  const retryCall = execute.mock.calls[1];

  expect(retryCall[0]).toContain('next_attempt_at = now()');
  expect(retryCall[0]).toContain('attempts = attempts + 1');
  expect(retryCall[1][0]).toBe(1);
  expect(retryCall[1][2]).toBe('outbox-event-002');
});
it('schedules a retry when marking the event as published fails', async () => {
  const event = {
    id: 'outbox-event-003',
    event_id: 'wallet-credited-003',
    event_type: 'WalletCredited',
    payload: {
      walletId: 'wallet-003',
    },
    created_at: new Date('2026-11-08T00:00:00.000Z'),
    attempts: 0,
  };

  const execute = mock(async (sql: string) => {
    if (sql.includes('with candidates')) {
      return [event];
    }

    if (sql.includes('published_at = now()')) {
      throw new Error('Database unavailable');
    }

    return [];
  });

  const em = {
    getConnection: () => ({ execute }),
  };

  const send = mock(async () => ({
    MessageId: 'sqs-message-003',
  }));

  const sqs = {
    send,
    destroy: mock(() => undefined),
  };

  const service = new OutboxPublisherService(
    em as never,
    sqs as never,
  );

  (
    service as unknown as { queueUrl: string }
  ).queueUrl = 'http://localhost:4566/000000000000/wager-events';

  const published = await service.publishPendingEvents();

  expect(published).toBe(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(3);

  expect(execute.mock.calls[1][0]).toContain(
    'published_at = now()',
  );

  expect(execute.mock.calls[2][0]).toContain(
    'next_attempt_at = now()',
  );
});
it('does not send messages when there are no pending events', async () => {
  const execute = mock(async () => []);

  const em = {
    getConnection: () => ({ execute }),
  };

  const send = mock(async () => ({
    MessageId: 'unexpected-message',
  }));

  const sqs = {
    send,
    destroy: mock(() => undefined),
  };

  const service = new OutboxPublisherService(
    em as never,
    sqs as never,
  );

  const published = await service.publishPendingEvents();

  expect(published).toBe(0);
  expect(send).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledTimes(1);
});
});