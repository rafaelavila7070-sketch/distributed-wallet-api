import { describe, expect, it } from 'bun:test';
import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('returns API health information', () => {
    const controller = new AppController();
    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'distributed-wallet-api',
    });
  });
});
