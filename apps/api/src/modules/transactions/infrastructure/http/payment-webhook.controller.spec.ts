import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ProblemDetails } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import request from 'supertest';

import type { AppConfig } from '../../../../config/app-config';
import { APP_CONFIG } from '../../../../config/app-config';
import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import { okAsync } from '../../../../shared/domain/result';
import { eventChecksum } from '../../domain/event-checksum';
import type {
  HandlePaymentWebhookResult,
  PaymentWebhookEvent,
} from '../../application/use-cases/handle-payment-webhook.use-case';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import approvedFixture from './__fixtures__/transaction-updated-approved.json';
import otherEventFixture from './__fixtures__/other-event.json';
import { EVENT_CHECKSUM_HEADER } from './transactions-http.constants';
import { PaymentWebhookController } from './payment-webhook.controller';

const TEST_EVENTS_SECRET = 'test-events-secret';

function asProblem(body: unknown): ProblemDetails {
  return body as ProblemDetails;
}

function checksumFor(fixture: {
  data: unknown;
  signature: { properties: string[] };
  timestamp: number;
}): string {
  return eventChecksum({
    data: fixture.data,
    properties: fixture.signature.properties,
    timestamp: fixture.timestamp,
    secret: TEST_EVENTS_SECRET,
  });
}

class FakeHandlePaymentWebhookUseCase {
  readonly calls: PaymentWebhookEvent[] = [];

  constructor(private readonly result: HandlePaymentWebhookResult = 'FINALIZED') {}

  execute(event: PaymentWebhookEvent) {
    this.calls.push(event);
    return okAsync(this.result);
  }
}

function fakeAppConfig(): AppConfig {
  return {
    app: { nodeEnv: 'test', port: 3000, logLevel: 'debug' },
    db: { host: '', port: 5432, username: '', password: '', name: '', ssl: false },
    paymentGateway: {
      url: 'https://gateway.example.com',
      publicKey: '',
      privateKey: '',
      integritySecret: '',
      eventsSecret: TEST_EVENTS_SECRET,
    },
    smtp: { host: '', port: 465, user: '', password: '', from: '' },
  };
}

async function buildApp(useCase: FakeHandlePaymentWebhookUseCase): Promise<{
  app: INestApplication;
  server: Server;
}> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PaymentWebhookController],
    providers: [
      { provide: APP_CONFIG, useValue: fakeAppConfig() },
      { provide: HandlePaymentWebhookUseCase, useValue: useCase },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, server: app.getHttpServer() as Server };
}

describe('PaymentWebhookController', () => {
  let apps: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps = [];
  });

  async function build(useCase: FakeHandlePaymentWebhookUseCase) {
    const built = await buildApp(useCase);
    apps.push(built.app);
    return built;
  }

  it('returns 200 { data: { received: true } } for a validly checksummed event', async () => {
    const useCase = new FakeHandlePaymentWebhookUseCase('FINALIZED');
    const { server } = await build(useCase);

    const response = await request(server)
      .post('/api/v1/webhooks/payments')
      .set(EVENT_CHECKSUM_HEADER, checksumFor(approvedFixture))
      .send(approvedFixture);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { received: true } });
    expect(useCase.calls).toEqual([
      {
        type: 'transaction.updated',
        providerTransactionId: approvedFixture.data.transaction.id,
        status: 'APPROVED',
        statusMessage: null,
      },
    ]);
  });

  it('returns 401 INVALID_SIGNATURE when the checksum header is missing', async () => {
    const { server } = await build(new FakeHandlePaymentWebhookUseCase());

    const response = await request(server).post('/api/v1/webhooks/payments').send(approvedFixture);

    expect(response.status).toBe(401);
    expect(asProblem(response.body).code).toBe(ErrorCode.INVALID_SIGNATURE);
  });

  it('returns 401 INVALID_SIGNATURE for a wrong checksum', async () => {
    const { server } = await build(new FakeHandlePaymentWebhookUseCase());

    const response = await request(server)
      .post('/api/v1/webhooks/payments')
      .set(EVENT_CHECKSUM_HEADER, 'f'.repeat(64))
      .send(approvedFixture);

    expect(response.status).toBe(401);
    expect(asProblem(response.body).code).toBe(ErrorCode.INVALID_SIGNATURE);
  });

  it('returns 401 INVALID_SIGNATURE for a garbage body', async () => {
    const { server } = await build(new FakeHandlePaymentWebhookUseCase());

    const response = await request(server)
      .post('/api/v1/webhooks/payments')
      .set(EVENT_CHECKSUM_HEADER, 'f'.repeat(64))
      .send({ not: 'a payment event' });

    expect(response.status).toBe(401);
    expect(asProblem(response.body).code).toBe(ErrorCode.INVALID_SIGNATURE);
  });

  it('accepts a body with extra unknown fields (no 400, global ValidationPipe never runs on it)', async () => {
    const withExtra = { ...approvedFixture, unexpected_field: 'whatever' };
    const { server } = await build(new FakeHandlePaymentWebhookUseCase());

    const response = await request(server)
      .post('/api/v1/webhooks/payments')
      .set(EVENT_CHECKSUM_HEADER, checksumFor(approvedFixture))
      .send(withExtra);

    expect(response.status).toBe(200);
  });

  it('returns 200 for a valid event of another type', async () => {
    const useCase = new FakeHandlePaymentWebhookUseCase('IGNORED');
    const { server } = await build(useCase);

    const response = await request(server)
      .post('/api/v1/webhooks/payments')
      .set(EVENT_CHECKSUM_HEADER, checksumFor(otherEventFixture))
      .send(otherEventFixture);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { received: true } });
    expect(useCase.calls[0]?.type).toBe('transaction.created');
  });
});
