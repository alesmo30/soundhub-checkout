import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import request from 'supertest';

import type { AppConfig } from '../../../../config/app-config';
import { APP_CONFIG } from '../../../../config/app-config';
import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import { okAsync } from '../../../../shared/domain/result';
import {
  REDACT_CENSOR,
  REDACT_PATHS,
} from '../../../../shared/infrastructure/logging/redact-paths';
import { eventChecksum } from '../../domain/event-checksum';
import type { HandlePaymentWebhookResult } from '../../application/use-cases/handle-payment-webhook.use-case';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import approvedFixture from './__fixtures__/transaction-updated-approved.json';
import { EVENT_CHECKSUM_HEADER } from './transactions-http.constants';
import { PaymentWebhookController } from './payment-webhook.controller';

const TEST_EVENTS_SECRET = 'test-events-secret-for-logging';

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
  constructor(private readonly result: HandlePaymentWebhookResult = 'FINALIZED') {}

  execute() {
    return okAsync(this.result);
  }
}

class MemoryStream implements DestinationStream {
  private readonly chunks: string[] = [];

  write(chunk: string): void {
    this.chunks.push(chunk);
  }

  contents(): string {
    return this.chunks.join('');
  }
}

async function buildApp(stream: MemoryStream): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      LoggerModule.forRoot({
        pinoHttp: {
          stream,
          redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
        },
      }),
    ],
    controllers: [PaymentWebhookController],
    providers: [
      { provide: APP_CONFIG, useValue: fakeAppConfig() },
      { provide: HandlePaymentWebhookUseCase, useValue: new FakeHandlePaymentWebhookUseCase() },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useLogger(app.get(PinoLogger));
  configureApp(app);
  await app.init();
  return app;
}

// Same nestjs-pino module-level-singleton workaround as
// transactions.controller.logging.spec.ts: one app + stream for the block.
describe('PaymentWebhookController logging', () => {
  let app: INestApplication;
  let server: Server;
  let stream: MemoryStream;

  beforeAll(async () => {
    stream = new MemoryStream();
    app = await buildApp(stream);
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('never logs the checksum header, the secret or the body', async () => {
    const checksum = checksumFor(approvedFixture);

    const response = await request(server)
      .post('/api/v1/webhooks/payments')
      .set(EVENT_CHECKSUM_HEADER, checksum)
      .send(approvedFixture);

    expect(response.status).toBe(200);
    const logged = stream.contents();
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(checksum);
    expect(logged).not.toContain(TEST_EVENTS_SECRET);
    expect(logged).not.toContain(approvedFixture.data.transaction.reference);
    expect(logged).not.toContain(approvedFixture.data.transaction.customer_email);
  });
});
