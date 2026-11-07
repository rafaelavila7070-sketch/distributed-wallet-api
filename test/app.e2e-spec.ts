
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';

describe('Health endpoint (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/v1 returns service health', async () => {
    await request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect({
        status: 'ok',
        service: 'distributed-wallet-api',
        database: 'connected',
      });
  });

  it('returns the correlation ID sent by the client', async () => {
    await request(app.getHttpServer())
      .get('/api/v1')
      .set('x-correlation-id', 'e2e-correlation-123')
      .expect(200)
      .expect('x-correlation-id', 'e2e-correlation-123');
  });

  it('generates a correlation ID when the client does not send one', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1')
      .expect(200);

    expect(response.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
