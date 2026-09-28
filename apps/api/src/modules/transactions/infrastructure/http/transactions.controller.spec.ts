import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  ProblemDetails,
  Quote,
  TransactionCreated,
  TransactionView,
} from '@checkout/shared/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import request from 'supertest';

import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import type { Clock } from '../../../../shared/application/ports/clock.port';
import { DomainError } from '../../../../shared/domain/domain-error';
import { err, errAsync, ok, okAsync, ResultAsync } from '../../../../shared/domain/result';
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
import type {
  FinalizeTransactionOutcome,
  FinalizeTransactionUseCase,
} from '../../application/use-cases/finalize-transaction.use-case';
import { GetTransactionStatusUseCase } from '../../application/use-cases/get-transaction-status.use-case';
import type { NewTransaction, Transaction } from '../../domain/transaction';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';
import { TransactionsController } from './transactions.controller';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';
const TOTAL_IN_CENTS = 523_900;

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: CUSTOMER_ID,
    documentNumber: '1017234567',
    fullName: 'Ana Pérez',
    email: 'ana@mail.com',
    phone: '3001234567',
    ...overrides,
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
      cardToken: 'tok_test_12345',
      cardBrand: 'VISA',
      cardLast4: '4242',
      acceptanceToken: 'acc_test_token',
      personalAuthToken: 'auth_test_token',
    },
    delivery: {
      recipientName: 'Ana Pérez',
      phone: '3001234567',
      addressLine: 'Cra 43A # 1-50',
      municipalityCode: '05001',
    },
    ...overrides,
  };
}

function asProblem(body: unknown): ProblemDetails {
  return body as ProblemDetails;
}

function asBody(body: unknown): { data: TransactionCreated } {
  return body as { data: TransactionCreated };
}

function asViewBody(body: unknown): { data: TransactionView } {
  return body as { data: TransactionView };
}

function buildTransactionView(overrides: Partial<TransactionView> = {}): TransactionView {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    reference: 'ref-1',
    status: 'PENDING',
    statusMessage: null,
    product: { id: PRODUCT_ID, name: 'Sony WH-1000XM5', imageUrl: '/images/products/1.webp' },
    quantity: 2,
    installments: 1,
    amounts: {
      unitPriceInCents: 250_000,
      subtotalInCents: 500_000,
      baseFeeInCents: 15_900,
      deliveryFeeInCents: 8_000,
      totalInCents: TOTAL_IN_CENTS,
      currency: 'COP',
    },
    card: { brand: 'VISA', last4: '4242' },
    delivery: { id: '55555555-5555-4555-8555-555555555555', status: 'AWAITING_PAYMENT' },
    createdAt: '2026-09-27T00:00:00.000Z',
    finalizedAt: null,
    ...overrides,
  };
}

// In-memory doubles, duplicated from create-transaction.use-case.spec.ts on
// purpose (references/coding-conventions.md#c3): this spec's only concern is
// the HTTP layer (status, headers, envelope), reusing the real
// CreateTransactionUseCase wired with fakes, never re-testing its own
// branches — those are already proven at the use-case level.
class FakeTransactionRepository implements TransactionRepository {
  private readonly byId = new Map<string, Transaction>();
  insertCalls: NewTransaction[] = [];
  findByKeyCalls = 0;

  findByIdempotencyKey(key: string): ResultAsync<Transaction | null, never> {
    this.findByKeyCalls += 1;
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
    this.insertCalls.push(values);
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
  insertCalls: NewDelivery[] = [];

  findByTransactionId(transactionId: string): ResultAsync<Delivery | null, never> {
    return okAsync(this.byTransactionId.get(transactionId) ?? null);
  }

  findById(): never {
    throw new Error('not used by this spec');
  }

  insert(_tx: TxContext, delivery: NewDelivery): ResultAsync<Delivery, never> {
    this.insertCalls.push(delivery);
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
  constructor(private readonly customer: Customer | null = buildCustomer()) {}

  findById(): ResultAsync<Customer | null, never> {
    return okAsync(this.customer);
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
  constructor(private readonly outcome: StockReservationOutcome = 'RESERVED') {}

  reserve(): ResultAsync<StockReservationOutcome, never> {
    return okAsync(this.outcome);
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

class FakePaymentGateway implements PaymentGatewayPort {
  calls = 0;
  createChargeCalls: CreateChargeRequest[] = [];

  constructor(
    private readonly available: boolean = true,
    private readonly chargeResult: ResultAsync<GatewayCharge, PaymentGatewayError> = okAsync({
      providerTransactionId: 'gw-1',
      status: 'PENDING',
      statusMessage: null,
      cardBrand: null,
      cardLast4: null,
    }),
  ) {}

  ensureAvailable() {
    const failure: PaymentGatewayError = { kind: 'UNAVAILABLE', message: 'breaker open' };
    return this.available ? ok(undefined) : err(failure);
  }

  createCharge(request: CreateChargeRequest): ResultAsync<GatewayCharge, PaymentGatewayError> {
    this.calls += 1;
    this.createChargeCalls.push(request);
    return this.chargeResult;
  }

  getCharge(): never {
    throw new Error('not used by this spec');
  }

  findChargeByReference(): never {
    throw new Error('not used by this spec');
  }
}

// GetQuoteUseCase and FinalizeTransactionUseCase both have a private `deps`
// constructor field, so no plain object structurally satisfies them; the
// cast at each call site is the only place that needs it (same technique as
// create-transaction.use-case.spec.ts).
class FakeGetQuoteUseCase {
  constructor(private readonly result: ResultAsync<Quote, DomainError> = okAsync(buildQuote())) {}

  execute(): ResultAsync<Quote, DomainError> {
    return this.result;
  }
}

class FakeFinalizeTransactionUseCase {
  calls: FinalizeTransactionOutcome[] = [];

  execute(outcome: FinalizeTransactionOutcome): ResultAsync<'FINALIZED' | 'ALREADY_FINAL', never> {
    this.calls.push(outcome);
    return okAsync('FINALIZED');
  }
}

class FakeGetTransactionStatusUseCase {
  constructor(
    private readonly result: ResultAsync<TransactionView, DomainError> = okAsync(
      buildTransactionView(),
    ),
  ) {}

  execute(): ResultAsync<TransactionView, DomainError> {
    return this.result;
  }
}

interface BuildAppParams {
  readonly customerRepo?: FakeCustomerRepository;
  readonly getQuoteUseCase?: FakeGetQuoteUseCase;
  readonly stockReservation?: FakeStockReservation;
  readonly paymentGateway?: FakePaymentGateway;
  readonly getTransactionStatusUseCase?: FakeGetTransactionStatusUseCase;
}

async function buildApp(params: BuildAppParams = {}): Promise<{
  app: INestApplication;
  server: Server;
  transactionRepo: FakeTransactionRepository;
  paymentGateway: FakePaymentGateway;
}> {
  const transactionRepo = new FakeTransactionRepository();
  const deliveryRepo = new FakeDeliveryRepository();
  const customerRepo = params.customerRepo ?? new FakeCustomerRepository();
  const paymentGateway = params.paymentGateway ?? new FakePaymentGateway();
  const getQuoteUseCase = params.getQuoteUseCase ?? new FakeGetQuoteUseCase();
  const stockReservation = params.stockReservation ?? new FakeStockReservation();
  const getTransactionStatusUseCase =
    params.getTransactionStatusUseCase ?? new FakeGetTransactionStatusUseCase();

  const useCase = new CreateTransactionUseCase({
    transactionRepository: transactionRepo,
    deliveryRepository: deliveryRepo,
    customerRepository: customerRepo,
    paymentGateway,
    getQuoteUseCase: getQuoteUseCase as unknown as GetQuoteUseCase,
    stockReservation,
    unitOfWork: new FakeUnitOfWork(),
    clock: new FakeClock(),
    finalizeTransactionUseCase:
      new FakeFinalizeTransactionUseCase() as unknown as FinalizeTransactionUseCase,
    random: Math.random,
  });

  const moduleRef = await Test.createTestingModule({
    controllers: [TransactionsController],
    providers: [
      { provide: CreateTransactionUseCase, useValue: useCase },
      { provide: GetTransactionStatusUseCase, useValue: getTransactionStatusUseCase },
      IdempotencyKeyPipe,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, server: app.getHttpServer() as Server, transactionRepo, paymentGateway };
}

describe('TransactionsController', () => {
  let apps: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps = [];
  });

  async function build(params: BuildAppParams = {}) {
    const built = await buildApp(params);
    apps.push(built.app);
    return built;
  }

  it('returns 201 with Location, Cache-Control: no-store and the TransactionCreated envelope', async () => {
    const { server } = await build();

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody());

    expect(response.status).toBe(201);
    const body = asBody(response.body);
    expect(response.headers.location).toBe(`/api/v1/transactions/${body.data.id}`);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['idempotent-replayed']).toBeUndefined();
    expect(body.data).toMatchObject({
      status: 'PENDING',
      statusMessage: null,
      totalInCents: TOTAL_IN_CENTS,
      currency: 'COP',
      delivery: { status: 'AWAITING_PAYMENT' },
    });
    expect(body.data.reference).toEqual(expect.any(String));
    expect(body.data.createdAt).toEqual(expect.any(String));
  });

  it('creates exactly 1 transaction and calls the gateway once across 5 identical requests', async () => {
    const { server, transactionRepo, paymentGateway } = await build();

    const responses = [];
    for (let index = 0; index < 5; index += 1) {
      responses.push(
        // Sequential on purpose: replays must observe the prior insert.
        await request(server)
          .post('/api/v1/transactions')
          .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
          .send(validBody()),
      );
    }

    expect(responses.every((response) => response.status === 201)).toBe(true);
    const ids = responses.map((response) => asBody(response.body).data.id);
    expect(new Set(ids).size).toBe(1);
    expect(responses[0]?.headers['idempotent-replayed']).toBeUndefined();
    for (const response of responses.slice(1)) {
      expect(response.headers['idempotent-replayed']).toBe('true');
    }
    expect(transactionRepo.insertCalls).toHaveLength(1);
    expect(paymentGateway.calls).toBe(1);
  });

  it('returns 400 MISSING_IDEMPOTENCY_KEY when the header is missing', async () => {
    const { server } = await build();

    const response = await request(server).post('/api/v1/transactions').send(validBody());

    expect(response.status).toBe(400);
    expect(asProblem(response.body).code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 400 MISSING_IDEMPOTENCY_KEY when the header is not a uuid v4', async () => {
    const { server } = await build();

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, 'not-a-uuid')
      .send(validBody());

    expect(response.status).toBe(400);
    expect(asProblem(response.body).code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 400 with errors[] for an unknown field', async () => {
    const { server } = await build();

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody({ extraField: 'nope' }));

    expect(response.status).toBe(400);
    expect(asProblem(response.body).code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('returns 400 with errors[] for quantity 0', async () => {
    const { server } = await build();

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody({ quantity: 0 }));

    expect(response.status).toBe(400);
    expect(asProblem(response.body).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'quantity' })]),
    );
  });

  it('returns 400 with errors[] for quantity 11', async () => {
    const { server } = await build();

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody({ quantity: 11 }));

    expect(response.status).toBe(400);
    expect(asProblem(response.body).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'quantity' })]),
    );
  });

  it('returns 400 with errors[] for installments 0', async () => {
    const { server } = await build();

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody({ installments: 0 }));

    expect(response.status).toBe(400);
    expect(asProblem(response.body).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'installments' })]),
    );
  });

  it('returns 400 with errors[] for installments 37', async () => {
    const { server } = await build();

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody({ installments: 37 }));

    expect(response.status).toBe(400);
    expect(asProblem(response.body).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'installments' })]),
    );
  });

  it('returns 400 with errors[] naming the dotted field for a malformed nested phone', async () => {
    const { server } = await build();

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody({ delivery: { ...(validBody()['delivery'] as object), phone: '123' } }));

    expect(response.status).toBe(400);
    expect(asProblem(response.body).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'delivery.phone' })]),
    );
  });

  it('returns 409 OUT_OF_STOCK when the quote reports insufficient stock', async () => {
    const quoteError = new DomainError(ErrorCode.OUT_OF_STOCK, 'CONFLICT', 'Only 1 unit available');
    const { server } = await build({
      getQuoteUseCase: new FakeGetQuoteUseCase(errAsync(quoteError)),
    });

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody());

    expect(response.status).toBe(409);
    expect(asProblem(response.body).code).toBe('OUT_OF_STOCK');
  });

  it('returns 409 PRICE_CHANGED when the recomputed total differs from expectedTotalInCents', async () => {
    const { server } = await build({
      getQuoteUseCase: new FakeGetQuoteUseCase(
        okAsync(buildQuote({ totalInCents: TOTAL_IN_CENTS + 1_000 })),
      ),
    });

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody());

    expect(response.status).toBe(409);
    expect(asProblem(response.body).code).toBe('PRICE_CHANGED');
  });

  it('returns 422 CUSTOMER_NOT_FOUND for an unknown customer', async () => {
    const { server } = await build({ customerRepo: new FakeCustomerRepository(null) });

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody());

    expect(response.status).toBe(422);
    expect(asProblem(response.body).code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('returns 422 PRODUCT_NOT_FOUND when the quote reports an unknown product', async () => {
    const quoteError = new DomainError(
      ErrorCode.PRODUCT_NOT_FOUND,
      'UNPROCESSABLE',
      'Product not found',
    );
    const { server } = await build({
      getQuoteUseCase: new FakeGetQuoteUseCase(errAsync(quoteError)),
    });

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody());

    expect(response.status).toBe(422);
    expect(asProblem(response.body).code).toBe('PRODUCT_NOT_FOUND');
  });

  it('returns 503 PAYMENT_GATEWAY_UNAVAILABLE with Retry-After: 30 when the breaker is open', async () => {
    const { server } = await build({ paymentGateway: new FakePaymentGateway(false) });

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody());

    expect(response.status).toBe(503);
    expect(asProblem(response.body).code).toBe('PAYMENT_GATEWAY_UNAVAILABLE');
    expect(response.headers['retry-after']).toBe('30');
  });

  it('never sets Retry-After on a 400', async () => {
    const { server } = await build();

    const response = await request(server).post('/api/v1/transactions').send(validBody());

    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('returns 201 ERROR with a statusMessage when the gateway rejects the charge', async () => {
    const rejected: ResultAsync<GatewayCharge, PaymentGatewayError> = errAsync({
      kind: 'REJECTED',
      message: 'Invalid token',
    });
    const { server } = await build({ paymentGateway: new FakePaymentGateway(true, rejected) });

    const response = await request(server)
      .post('/api/v1/transactions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY)
      .send(validBody());

    expect(response.status).toBe(201);
    const body = asBody(response.body);
    expect(body.data.status).toBe('ERROR');
    expect(body.data.statusMessage).toBe('Invalid token');
  });

  describe('GET /transactions/:id', () => {
    const KNOWN_TRANSACTION_ID = '44444444-4444-4444-8444-444444444444';
    const UNKNOWN_TRANSACTION_ID = '66666666-6666-4666-8666-666666666666';

    it('returns 200 with Cache-Control: no-store and Retry-After: 2 for a PENDING transaction', async () => {
      const { server } = await build({
        getTransactionStatusUseCase: new FakeGetTransactionStatusUseCase(
          okAsync(buildTransactionView({ status: 'PENDING' })),
        ),
      });

      const response = await request(server).get(`/api/v1/transactions/${KNOWN_TRANSACTION_ID}`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['retry-after']).toBe('2');
      expect(asViewBody(response.body).data.status).toBe('PENDING');
    });

    it('returns 200 with Cache-Control: no-store and no Retry-After for an APPROVED transaction', async () => {
      const { server } = await build({
        getTransactionStatusUseCase: new FakeGetTransactionStatusUseCase(
          okAsync(
            buildTransactionView({ status: 'APPROVED', finalizedAt: '2026-09-27T00:00:00.000Z' }),
          ),
        ),
      });

      const response = await request(server).get(`/api/v1/transactions/${KNOWN_TRANSACTION_ID}`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['retry-after']).toBeUndefined();
      expect(asViewBody(response.body).data.status).toBe('APPROVED');
    });

    it('returns 400 VALIDATION_ERROR for a non-uuid id', async () => {
      const { server } = await build();

      const response = await request(server).get('/api/v1/transactions/not-a-uuid');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 404 TRANSACTION_NOT_FOUND for an unknown id, with neither Retry-After nor no-store', async () => {
      const notFound = new DomainError(
        ErrorCode.TRANSACTION_NOT_FOUND,
        'NOT_FOUND',
        `Transaction ${UNKNOWN_TRANSACTION_ID} not found`,
      );
      const { server } = await build({
        getTransactionStatusUseCase: new FakeGetTransactionStatusUseCase(errAsync(notFound)),
      });

      const response = await request(server).get(`/api/v1/transactions/${UNKNOWN_TRANSACTION_ID}`);

      expect(response.status).toBe(404);
      expect(asProblem(response.body).code).toBe('TRANSACTION_NOT_FOUND');
      expect(response.headers['retry-after']).toBeUndefined();
      expect(response.headers['cache-control']).toBeUndefined();
    });

    it('never includes email or documentNumber in the body at any depth', async () => {
      const { server } = await build({
        getTransactionStatusUseCase: new FakeGetTransactionStatusUseCase(
          okAsync(buildTransactionView()),
        ),
      });

      const response = await request(server).get(`/api/v1/transactions/${KNOWN_TRANSACTION_ID}`);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/email/i);
      expect(serialized).not.toMatch(/documentNumber/i);
    });
  });
});
