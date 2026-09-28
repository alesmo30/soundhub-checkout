import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Quote } from '@checkout/shared/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@checkout/shared/contracts';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import request from 'supertest';

import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, ok, okAsync, ResultAsync } from '../../../../shared/domain/result';
import {
  REDACT_CENSOR,
  REDACT_PATHS,
} from '../../../../shared/infrastructure/logging/redact-paths';
import type { Customer, CustomerRepository } from '../../../customers';
import type { Delivery, DeliveryRepository, NewDelivery } from '../../../deliveries';
import type { GetQuoteUseCase } from '../../../pricing';
import type {
  CreateChargeRequest,
  GatewayCharge,
  PaymentGatewayError,
  PaymentGatewayPort,
} from '../../application/ports/payment-gateway.port';
import type {
  StockReservationOutcome,
  StockReservationPort,
} from '../../application/ports/stock-reservation.port';
import type {
  TransactionRepository,
  TransactionUniqueViolation,
} from '../../application/ports/transaction.repository.port';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import type { FinalizeTransactionUseCase } from '../../application/use-cases/finalize-transaction.use-case';
import type { NewTransaction, Transaction } from '../../domain/transaction';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';
import { TransactionsController } from './transactions.controller';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';
const TOTAL_IN_CENTS = 523_900;

const CARD_TOKEN = 'tok_test_secret_12345';
const REJECTED_CARD_TOKEN = 'tok_test_secret_rejected';
const ACCEPTANCE_TOKEN = 'acc_test_secret_token';
const PERSONAL_AUTH_TOKEN = 'auth_test_secret_token';
const EMAIL = 'ana@mail.com';
const PHONE = '3001234567';

function buildCustomer(): Customer {
  return {
    id: CUSTOMER_ID,
    documentNumber: '1017234567',
    fullName: 'Ana Pérez',
    email: EMAIL,
    phone: PHONE,
  };
}

function buildQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    product: { id: PRODUCT_ID, name: 'Sony WH-1000XM5', unitPriceInCents: 250_000 },
    quantity: 2,
    subtotalInCents: 500_000,
    vatIncludedInCents: 79_800,
    baseFeeInCents: 15_900,
    delivery: {
      feeInCents: 8_000,
      rule: 'NATIONAL_DISTANCE',
      distanceKm: 12,
      warehouse: { id: 'warehouse-1', name: 'Bodega Medellín' },
    },
    totalInCents: TOTAL_IN_CENTS,
    currency: 'COP',
    ...overrides,
  };
}

function validBody(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    quantity: 2,
    installments: 1,
    expectedTotalInCents: TOTAL_IN_CENTS,
    payment: {
      cardToken: CARD_TOKEN,
      cardBrand: 'VISA',
      cardLast4: '4242',
      acceptanceToken: ACCEPTANCE_TOKEN,
      personalAuthToken: PERSONAL_AUTH_TOKEN,
    },
    delivery: {
      recipientName: 'Ana Pérez',
      phone: PHONE,
      addressLine: 'Cra 43A # 1-50',
      municipalityCode: '05001',
    },
    ...overrides,
  };
}

// Same in-memory doubles as transactions.controller.spec.ts, duplicated on
// purpose: this spec's only concern is what the logger writes, not the
// status/header behavior already covered elsewhere.
class FakeTransactionRepository implements TransactionRepository {
  private readonly byId = new Map<string, Transaction>();

  findByIdempotencyKey(key: string): ResultAsync<Transaction | null, never> {
    const existing = [...this.byId.values()].find((tx) => tx.idempotencyKey === key) ?? null;
    return okAsync(existing);
  }

  findById(): never {
    throw new Error('not used by this spec');
  }

  insert(
    _tx: TxContext,
    values: NewTransaction,
  ): ResultAsync<Transaction, TransactionUniqueViolation> {
    const inserted: Transaction = {
      id: randomUUID(),
      status: 'PENDING',
      providerTransactionId: null,
      providerStatusMessage: null,
      finalizedAt: null,
      emailSentAt: null,
      createdAt: new Date('2026-09-27T00:00:00.000Z'),
      updatedAt: new Date('2026-09-27T00:00:00.000Z'),
      deletedAt: null,
      ...values,
    };
    this.byId.set(inserted.id, inserted);
    return okAsync(inserted);
  }

  recordGatewayResponse(
    _tx: TxContext,
    response: { id: string; providerTransactionId: string; statusMessage: string | null },
  ): ResultAsync<void, never> {
    const existing = this.byId.get(response.id);
    if (existing) {
      this.byId.set(response.id, {
        ...existing,
        providerTransactionId: response.providerTransactionId,
        providerStatusMessage: response.statusMessage,
      });
    }
    return okAsync(undefined);
  }

  finalize(): never {
    throw new Error('not used by this spec');
  }

  markEmailSent(): never {
    throw new Error('not used by this spec');
  }

  claimPendingForSync(): never {
    throw new Error('not used by this spec');
  }

  claimExpiredReservations(): never {
    throw new Error('not used by this spec');
  }

  findUnsentEmails(): never {
    throw new Error('not used by this spec');
  }
}

class FakeDeliveryRepository implements DeliveryRepository {
  private readonly byTransactionId = new Map<string, Delivery>();

  findByTransactionId(transactionId: string): ResultAsync<Delivery | null, never> {
    return okAsync(this.byTransactionId.get(transactionId) ?? null);
  }

  findById(): never {
    throw new Error('not used by this spec');
  }

  insert(_tx: TxContext, delivery: NewDelivery): ResultAsync<Delivery, never> {
    const inserted: Delivery = {
      id: randomUUID(),
      status: 'AWAITING_PAYMENT',
      createdAt: new Date('2026-09-27T00:00:00.000Z'),
      updatedAt: new Date('2026-09-27T00:00:00.000Z'),
      deletedAt: null,
      ...delivery,
    };
    this.byTransactionId.set(delivery.transactionId, inserted);
    return okAsync(inserted);
  }

  transition(): never {
    throw new Error('not used by this spec');
  }
}

class FakeCustomerRepository implements CustomerRepository {
  findById(): ResultAsync<Customer | null, never> {
    return okAsync(buildCustomer());
  }

  findByDocumentNumber(): never {
    throw new Error('not used by this spec');
  }

  findByEmail(): never {
    throw new Error('not used by this spec');
  }

  insert(): never {
    throw new Error('not used by this spec');
  }

  updateContact(): never {
    throw new Error('not used by this spec');
  }
}

class FakeStockReservation implements StockReservationPort {
  reserve(): ResultAsync<StockReservationOutcome, never> {
    return okAsync('RESERVED');
  }

  commit(): ResultAsync<void, never> {
    return okAsync(undefined);
  }

  release(): ResultAsync<void, never> {
    return okAsync(undefined);
  }
}

class FakeUnitOfWork implements UnitOfWork {
  private readonly tx: TxContext = { __brand: 'TxContext' };

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    return work(this.tx);
  }
}

class FakeClock implements Clock {
  now(): Date {
    return new Date('2026-09-27T00:00:00.000Z');
  }
}

// Routes by cardToken instead of a fixed constructor result, so one instance
// (and therefore one CreateTransactionUseCase, one app and one root logger —
// see the describe-block comment below) can serve both the success and the
// rejection scenario.
class FakePaymentGateway implements PaymentGatewayPort {
  createCharge(request: CreateChargeRequest): ResultAsync<GatewayCharge, PaymentGatewayError> {
    if (request.cardToken === REJECTED_CARD_TOKEN) {
      return errAsync({ kind: 'REJECTED', message: 'Invalid token' });
    }

    return okAsync({
      providerTransactionId: 'gw-1',
      status: 'PENDING',
      statusMessage: null,
      cardBrand: null,
      cardLast4: null,
    });
  }

  ensureAvailable() {
    return ok(undefined);
  }

  getCharge(): never {
    throw new Error('not used by this spec');
  }

  findChargeByReference(): never {
    throw new Error('not used by this spec');
  }
}

class FakeGetQuoteUseCase {
  execute(): ResultAsync<Quote, DomainError> {
    return okAsync(buildQuote());
  }
}

class FakeFinalizeTransactionUseCase {
  execute(): ResultAsync<'FINALIZED' | 'ALREADY_FINAL', never> {
    return okAsync('FINALIZED');
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

function buildUseCase(): CreateTransactionUseCase {
  return new CreateTransactionUseCase({
    transactionRepository: new FakeTransactionRepository(),
    deliveryRepository: new FakeDeliveryRepository(),
    customerRepository: new FakeCustomerRepository(),
    paymentGateway: new FakePaymentGateway(),
    getQuoteUseCase: new FakeGetQuoteUseCase() as unknown as GetQuoteUseCase,
    stockReservation: new FakeStockReservation(),
    unitOfWork: new FakeUnitOfWork(),
    clock: new FakeClock(),
    finalizeTransactionUseCase:
      new FakeFinalizeTransactionUseCase() as unknown as FinalizeTransactionUseCase,
    random: Math.random,
  });
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
    controllers: [TransactionsController],
    providers: [
      { provide: CreateTransactionUseCase, useValue: buildUseCase() },
      IdempotencyKeyPipe,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useLogger(app.get(PinoLogger));
  configureApp(app);
  await app.init();
  return app;
}

// nestjs-pino keeps its pino-http middleware in a module-level singleton
// (`rootLogger.ts`: "built once, whoever gets there first") not reset
// between LoggerModule.forRoot() calls within the same test file (see
// customers.controller.logging.spec.ts's own comment) — one app + stream for
// the whole describe block sidesteps that. The success and rejection paths
// share it, distinguished by cardToken (FakePaymentGateway above), and each
// assertion reads the stream's accumulated content so far.
describe('TransactionsController logging', () => {
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

  it('never logs the card token, either acceptance token, the email or the phone on a 201 PENDING', async () => {
    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody());

    expect(response.status).toBe(201);
    const logged = stream.contents();
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(CARD_TOKEN);
    expect(logged).not.toContain(ACCEPTANCE_TOKEN);
    expect(logged).not.toContain(PERSONAL_AUTH_TOKEN);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(PHONE);
  });

  it('never logs the card token, either acceptance token, the email or the phone on a rejected charge', async () => {
    const rejectedIdempotencyKey = '44444444-4444-4444-8444-444444444444';
    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, rejectedIdempotencyKey)
      .send(
        validBody({
          payment: { ...(validBody()['payment'] as object), cardToken: REJECTED_CARD_TOKEN },
        }),
      );

    expect(response.status).toBe(201);
    const logged = stream.contents();
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(CARD_TOKEN);
    expect(logged).not.toContain(REJECTED_CARD_TOKEN);
    expect(logged).not.toContain(ACCEPTANCE_TOKEN);
    expect(logged).not.toContain(PERSONAL_AUTH_TOKEN);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(PHONE);
  });
});
