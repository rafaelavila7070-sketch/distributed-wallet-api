import { describe, expect, it, mock } from 'bun:test';
import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('returns API health information when database is connected', async () => {
    const em = {
      getConnection: () => ({
        execute: mock(() => Promise.resolve([{ '?column?': 1 }])),
      }),
    };

    const controller = new AppController(em as never);

    expect(await controller.getHealth()).toEqual({
      status: 'ok',
      service: 'distributed-wallet-api',
      database: 'connected',
    });
  });

  it('returns error when database is unavailable', async () => {
    const em = {
      getConnection: () => ({
        execute: mock(() => Promise.reject(new Error('Database unavailable'))),
      }),
    };

    const controller = new AppController(em as never);

    expect(await controller.getHealth()).toEqual({
      status: 'error',
      service: 'distributed-wallet-api',
      database: 'disconnected',
    });
  });
});