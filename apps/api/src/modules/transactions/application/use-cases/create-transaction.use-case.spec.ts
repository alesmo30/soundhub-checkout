import { RESERVATION_TTL_MS } from '@checkout/shared/constants';
import { ErrorCode } from '@checkout/shared/enums';
import type { Quote } from '@checkout/shared/contracts';

import type { Customer } from '../../../customers';
import type { CustomerRepository } from '../../../customers';
import type { Delivery, NewDelivery } from '../../../deliveries';
import type { DeliveryRepository } from '../../../deliveries';
import type { GetQuoteUseCase } from '../../../pricing';
import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { DomainError } from '../../../../shared/domain/domain-error';
import { err, errAsync, ok, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { NewTransaction, Transaction } from '../../domain/transaction';
import type {
  CreateChargeRequest,
  GatewayCharge,
  PaymentGatewayError,
  PaymentGatewayPort,
} from '../ports/payment-gateway.port';
import type {
  StockLine,
  StockReservationOutcome,
  StockReservationPort,
} from '../ports/stock-reservation.port';
import type {
  TransactionRepository,
  TransactionUniqueViolation,
} from '../ports/transaction.repository.port';
import type {
  FinalizeTransactionOutcome,
  FinalizeTransactionUseCase,
} from './finalize-transaction.use-case';
import type { CreateTransactionCommand } from './create-transaction.use-case';
import { CreateTransactionUseCase } from './create-transaction.use-case';

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1',
    reference: 'TX-20260927-ABC123',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    requestHash: 'hash-a',
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 1,
    unitPriceInCents: 500_000,
    subtotalInCents: 500_000,
    baseFeeInCents: 0,
    deliveryFeeInCents: 0,
    totalInCents: 500_000,
    currency: 'COP',
    status: 'PENDING',
    installments: 1,
    cardBrand: 'VISA',
    cardLast4: '4242',
    providerTransactionId: null,
    providerStatusMessage: null,
    reservationExpiresAt: new Date('2026-09-27T00:05:00.000Z'),
    finalizedAt: null,
    emailSentAt: null,
    createdAt: new Date('2026-09-27T00:00:00.000Z'),
    updatedAt: new Date('2026-09-27T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildDelivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 'delivery-1',
    transactionId: 'transaction-1',
    warehouseId: 'warehouse-1',
    municipalityCode: '11001',
    status: 'AWAITING_PAYMENT',
    recipientName: 'Jane Doe',
    phone: '+573000000000',
    addressLine: 'Cra 1 # 2-3',
    addressDetail: null,
    distanceKm: 0,
    feeRule: 'FREE_METRO',
    createdAt: new Date('2026-09-27T00:00:00.000Z'),
    updatedAt: new Date('2026-09-27T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    documentNumber: '123456789',
    email: 'jane@example.com',
    fullName: 'Jane Doe',
    phone: '+573000000000',
    ...overrides,
  };
}

function buildQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    product: { id: 'product-1', name: 'Sony WH-1000XM5', unitPriceInCents: 500_000 },
    quantity: 1,
    subtotalInCents: 500_000,
    vatIncludedInCents: 79_800,
    baseFeeInCents: 15_900,
    delivery: {
      feeInCents: 0,
      rule: 'FREE_METRO',
      distanceKm: 0,
      warehouse: { id: 'warehouse-1', name: 'Bodega Bogotá' },
    },
    totalInCents: 500_000,
    currency: 'COP',
    ...overrides,
  };
}

function buildCommand(overrides: Partial<CreateTransactionCommand> = {}): CreateTransactionCommand {
  return {
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    requestHash: 'hash-a',
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 1,
    installments: 1,
    expectedTotalInCents: 500_000,
    payment: {
      cardToken: 'tok_test',
      cardBrand: 'VISA',
      cardLast4: '4242',
      acceptanceToken: 'acc_test',
      personalAuthToken: 'auth_test',
    },
    delivery: {
      recipientName: 'Jane Doe',
      phone: '+573000000000',
      addressLine: 'Cra 1 # 2-3',
      municipalityCode: '11001',
    },
    ...overrides,
  };
}

function buildGatewayCharge(overrides: Partial<GatewayCharge> = {}): GatewayCharge {
  return {
    providerTransactionId: 'gw-1',
    status: 'APPROVED',
    statusMessage: 'Approved',
    cardBrand: 'VISA',
    cardLast4: '4242',
    ...overrides,
  };
}

// Draws 0, 1, 2, … in sequence: generateReference's randomSuffix() feeds each
// value through `Math.floor(random() * REFERENCE_ALPHABET.length)`, so this
// walks the alphabet in order and never repeats within a test's attempts —
// the deterministic stand-in for Math.random() (see
// shared/infrastructure/resilience/retry-with-backoff.ts's own `random =
// Math.random` default parameter; no dedicated Random port exists).
function createSequentialRandom(): () => number {
  let seed = 0;
  return () => {
    const value = seed / 36;
    seed += 1;
    return value;
  };
}

class FakeTransactionRepository implements TransactionRepository {
  findByKeyCalls = 0;
  insertCalls: NewTransaction[] = [];
  insertAttempts = 0;
  recordGatewayResponseCalls: Array<{
    id: string;
    providerTransactionId: string;
    statusMessage: string | null;
  }> = [];

  constructor(
    private existing: Transaction | null,
    private readonly insertResults: ReadonlyArray<Transaction | TransactionUniqueViolation> = [],
    // A key collision means a concurrent request just won the race: its row
    // becomes visible only from this point on, never before.
    private readonly winnerAfterKeyCollision: Transaction | null = null,
  ) {}

  findByIdempotencyKey(): ResultAsync<Transaction | null, never> {
    this.findByKeyCalls += 1;
    return okAsync(this.existing);
  }

  findByProviderTransactionId(): never {
    throw new Error('not used by this spec');
  }

  findById(): never {
    throw new Error('not used by this spec');
  }

  insert(
    _tx: TxContext,
    values: NewTransaction,
  ): ResultAsync<Transaction, TransactionUniqueViolation> {
    this.insertCalls.push(values);
    const queued = this.insertResults[this.insertAttempts];
    this.insertAttempts += 1;

    if (queued === undefined) {
      throw new Error('FakeTransactionRepository.insert: no queued result for this attempt');
    }

    if ('constraint' in queued) {
      if (queued.constraint === 'IDEMPOTENCY_KEY' && this.winnerAfterKeyCollision) {
        this.existing = this.winnerAfterKeyCollision;
      }
      return errAsync(queued);
    }

    return okAsync(queued);
  }

  recordGatewayResponse(
    _tx: TxContext,
    response: { id: string; providerTransactionId: string; statusMessage: string | null },
  ): ResultAsync<void, never> {
    this.recordGatewayResponseCalls.push(response);
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
  calls = 0;
  insertCalls: NewDelivery[] = [];

  constructor(
    private readonly existing: Delivery | null,
    private readonly insertResult?: Delivery,
  ) {}

  findByTransactionId(): ResultAsync<Delivery | null, never> {
    this.calls += 1;
    return okAsync(this.existing);
  }

  findById(): never {
    throw new Error('not used by this spec');
  }

  insert(_tx: TxContext, delivery: NewDelivery): ResultAsync<Delivery, never> {
    this.insertCalls.push(delivery);
    return okAsync(this.insertResult ?? buildDelivery({ ...delivery }));
  }

  transition(): never {
    throw new Error('not used by this spec');
  }
}

class FakeCustomerRepository implements CustomerRepository {
  calls = 0;

  constructor(private readonly customer: Customer | null) {}

  findById(): ResultAsync<Customer | null, never> {
    this.calls += 1;
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
  reserveCalls: StockLine[] = [];
  releaseCalls: StockLine[] = [];
  commitCalls: StockLine[] = [];

  constructor(private readonly outcome: StockReservationOutcome = 'RESERVED') {}

  reserve(_tx: TxContext, line: StockLine): ResultAsync<StockReservationOutcome, never> {
    this.reserveCalls.push(line);
    return okAsync(this.outcome);
  }

  commit(_tx: TxContext, line: StockLine): ResultAsync<void, never> {
    this.commitCalls.push(line);
    return okAsync(undefined);
  }

  release(_tx: TxContext, line: StockLine): ResultAsync<void, never> {
    this.releaseCalls.push(line);
    return okAsync(undefined);
  }
}

// Toggles `insideRun` around the callback's own settlement (not just its
// synchronous invocation), so a spy that reads it from an `await`ed call
// genuinely observes whether it ran before or after this UnitOfWork
// committed — the structural half of "the gateway is never called inside
// UnitOfWork.run".
class FakeUnitOfWork implements UnitOfWork {
  readonly tx: TxContext = { __brand: 'TxContext' };
  runCount = 0;
  insideRun = false;

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    this.runCount += 1;
    this.insideRun = true;
    return work(this.tx)
      .map((value) => {
        this.insideRun = false;
        return value;
      })
      .mapErr((error) => {
        this.insideRun = false;
        return error;
      });
  }
}

class FakeClock implements Clock {
  constructor(private readonly value: Date = new Date('2026-09-27T00:00:00.000Z')) {}

  now(): Date {
    return this.value;
  }
}

class FakePaymentGateway implements PaymentGatewayPort {
  calls = 0;
  createChargeCalls: CreateChargeRequest[] = [];
  insideRunAtCreateCharge: boolean[] = [];

  constructor(
    private readonly available: boolean,
    private readonly chargeResult: ResultAsync<GatewayCharge, PaymentGatewayError> = okAsync(
      buildGatewayCharge(),
    ),
    private readonly unitOfWork?: FakeUnitOfWork,
  ) {}

  ensureAvailable() {
    this.calls += 1;
    const failure: PaymentGatewayError = { kind: 'UNAVAILABLE', message: 'breaker open' };
    return this.available ? ok(undefined) : err(failure);
  }

  createCharge(request: CreateChargeRequest): ResultAsync<GatewayCharge, PaymentGatewayError> {
    this.createChargeCalls.push(request);
    if (this.unitOfWork) {
      this.insideRunAtCreateCharge.push(this.unitOfWork.insideRun);
    }
    return this.chargeResult;
  }

  getCharge(): never {
    throw new Error('not used by this spec');
  }

  findChargeByReference(): never {
    throw new Error('not used by this spec');
  }
}

// GetQuoteUseCase has a private constructor field (`deps`), so no plain
// object structurally satisfies it — this stand-in plays the same role a
// jest.mock()'d instance would, and the cast at the call site is the only
// place that needs it.
class FakeGetQuoteUseCase {
  calls = 0;

  constructor(private readonly result: ResultAsync<Quote, DomainError>) {}

  execute(): ResultAsync<Quote, DomainError> {
    this.calls += 1;
    return this.result;
  }
}

// FinalizeTransactionUseCase has a private `deps` field too; same stand-in
// pattern as FakeGetQuoteUseCase above.
class FakeFinalizeTransactionUseCase {
  calls: FinalizeTransactionOutcome[] = [];

  constructor(
    private readonly result: ResultAsync<'FINALIZED' | 'ALREADY_FINAL', never> = okAsync(
      'FINALIZED',
    ),
  ) {}

  execute(outcome: FinalizeTransactionOutcome): ResultAsync<'FINALIZED' | 'ALREADY_FINAL', never> {
    this.calls.push(outcome);
    return this.result;
  }
}

function buildUseCase(params: {
  transactionRepo?: FakeTransactionRepository;
  deliveryRepo?: FakeDeliveryRepository;
  customerRepo?: FakeCustomerRepository;
  paymentGateway?: FakePaymentGateway;
  getQuoteUseCase?: FakeGetQuoteUseCase;
  stockReservation?: FakeStockReservation;
  unitOfWork?: FakeUnitOfWork;
  clock?: FakeClock;
  finalizeTransactionUseCase?: FakeFinalizeTransactionUseCase;
  random?: () => number;
}): {
  useCase: CreateTransactionUseCase;
  transactionRepo: FakeTransactionRepository;
  deliveryRepo: FakeDeliveryRepository;
  customerRepo: FakeCustomerRepository;
  paymentGateway: FakePaymentGateway;
  getQuoteUseCase: FakeGetQuoteUseCase;
  stockReservation: FakeStockReservation;
  unitOfWork: FakeUnitOfWork;
  clock: FakeClock;
  finalizeTransactionUseCase: FakeFinalizeTransactionUseCase;
} {
  const transactionRepo = params.transactionRepo ?? new FakeTransactionRepository(null);
  const deliveryRepo = params.deliveryRepo ?? new FakeDeliveryRepository(null);
  const customerRepo = params.customerRepo ?? new FakeCustomerRepository(buildCustomer());
  const paymentGateway = params.paymentGateway ?? new FakePaymentGateway(true);
  const getQuoteUseCase = params.getQuoteUseCase ?? new FakeGetQuoteUseCase(okAsync(buildQuote()));
  const stockReservation = params.stockReservation ?? new FakeStockReservation('RESERVED');
  const unitOfWork = params.unitOfWork ?? new FakeUnitOfWork();
  const clock = params.clock ?? new FakeClock();
  const finalizeTransactionUseCase =
    params.finalizeTransactionUseCase ?? new FakeFinalizeTransactionUseCase();
  const random = params.random ?? Math.random;

  const useCase = new CreateTransactionUseCase({
    transactionRepository: transactionRepo,
    deliveryRepository: deliveryRepo,
    customerRepository: customerRepo,
    paymentGateway,
    getQuoteUseCase: getQuoteUseCase as unknown as GetQuoteUseCase,
    stockReservation,
    unitOfWork,
    clock,
    finalizeTransactionUseCase: finalizeTransactionUseCase as unknown as FinalizeTransactionUseCase,
    random,
  });

  return {
    useCase,
    transactionRepo,
    deliveryRepo,
    customerRepo,
    paymentGateway,
    getQuoteUseCase,
    stockReservation,
    unitOfWork,
    clock,
    finalizeTransactionUseCase,
  };
}

describe('CreateTransactionUseCase', () => {
  it('replays the current state when the same key and hash are sent again', async () => {
    const existing = buildTransaction({ requestHash: 'hash-a', status: 'ERROR' });
    const delivery = buildDelivery({ status: 'CANCELLED' });
    const { useCase, deliveryRepo, customerRepo, paymentGateway, getQuoteUseCase } = buildUseCase({
      transactionRepo: new FakeTransactionRepository(existing),
      deliveryRepo: new FakeDeliveryRepository(delivery),
    });

    const result = await useCase.execute(buildCommand({ requestHash: 'hash-a' }));
    const outcome = result._unsafeUnwrap();

    expect(outcome.replayed).toBe(true);
    expect(outcome.view).toEqual({
      id: existing.id,
      reference: existing.reference,
      status: 'ERROR',
      statusMessage: existing.providerStatusMessage,
      totalInCents: existing.totalInCents,
      currency: 'COP',
      delivery: { id: delivery.id, status: 'CANCELLED' },
      createdAt: existing.createdAt.toISOString(),
    });
    expect(deliveryRepo.calls).toBe(1);
    expect(customerRepo.calls).toBe(0);
    expect(paymentGateway.calls).toBe(0);
    expect(getQuoteUseCase.calls).toBe(0);
  });

  it('rejects a replay whose hash does not match the stored request', async () => {
    const existing = buildTransaction({ requestHash: 'hash-a' });
    const { useCase, deliveryRepo, customerRepo, paymentGateway, getQuoteUseCase } = buildUseCase({
      transactionRepo: new FakeTransactionRepository(existing),
    });

    const result = await useCase.execute(buildCommand({ requestHash: 'hash-b' }));
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(error.kind).toBe('UNPROCESSABLE');
    expect(deliveryRepo.calls).toBe(0);
    expect(customerRepo.calls).toBe(0);
    expect(paymentGateway.calls).toBe(0);
    expect(getQuoteUseCase.calls).toBe(0);
  });

  it('fails without reading or writing anything else when the breaker is open', async () => {
    const { useCase, transactionRepo, customerRepo, deliveryRepo, getQuoteUseCase } = buildUseCase({
      paymentGateway: new FakePaymentGateway(false),
    });

    const result = await useCase.execute(buildCommand());
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE);
    expect(error.kind).toBe('UNAVAILABLE');
    expect(transactionRepo.findByKeyCalls).toBe(1);
    expect(customerRepo.calls).toBe(0);
    expect(deliveryRepo.calls).toBe(0);
    expect(getQuoteUseCase.calls).toBe(0);
  });

  it('returns CUSTOMER_NOT_FOUND for an unknown customer', async () => {
    const { useCase, getQuoteUseCase } = buildUseCase({
      customerRepo: new FakeCustomerRepository(null),
    });

    const result = await useCase.execute(buildCommand());
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.CUSTOMER_NOT_FOUND);
    expect(error.kind).toBe('UNPROCESSABLE');
    expect(getQuoteUseCase.calls).toBe(0);
  });

  it('passes a GetQuoteUseCase error through unchanged', async () => {
    const quoteError = new DomainError(
      ErrorCode.OUT_OF_STOCK,
      'CONFLICT',
      'Only 3 units available',
    );
    const { useCase } = buildUseCase({
      getQuoteUseCase: new FakeGetQuoteUseCase(errAsync(quoteError)),
    });

    const result = await useCase.execute(buildCommand());
    const error = result._unsafeUnwrapErr();

    expect(error).toBe(quoteError);
  });

  it('returns PRICE_CHANGED when the quote total no longer matches the expected total', async () => {
    const { useCase } = buildUseCase({
      getQuoteUseCase: new FakeGetQuoteUseCase(okAsync(buildQuote({ totalInCents: 550_000 }))),
    });

    const result = await useCase.execute(buildCommand({ expectedTotalInCents: 500_000 }));
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.PRICE_CHANGED);
    expect(error.kind).toBe('CONFLICT');
    expect(error.detail).toContain('500000');
    expect(error.detail).toContain('550000');
  });

  it('returns OUT_OF_STOCK and inserts nothing when the reservation fails', async () => {
    const transactionRepo = new FakeTransactionRepository(null);
    const deliveryRepo = new FakeDeliveryRepository(null);
    const { useCase } = buildUseCase({
      transactionRepo,
      deliveryRepo,
      stockReservation: new FakeStockReservation('INSUFFICIENT_STOCK'),
    });

    const result = await useCase.execute(buildCommand());
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.OUT_OF_STOCK);
    expect(error.kind).toBe('CONFLICT');
    expect(transactionRepo.insertCalls).toHaveLength(0);
    expect(deliveryRepo.insertCalls).toHaveLength(0);
  });

  it('inserts the transaction snapshot, the reservation expiry and the delivery from the quote', async () => {
    const quote = buildQuote({
      subtotalInCents: 500_000,
      baseFeeInCents: 15_900,
      delivery: {
        feeInCents: 8_000,
        rule: 'NATIONAL_DISTANCE',
        distanceKm: 12,
        warehouse: { id: 'warehouse-9', name: 'Bodega Medellín' },
      },
      totalInCents: 523_900,
    });
    const now = new Date('2026-09-27T00:00:00.000Z');
    const transactionRepo = new FakeTransactionRepository(null, [buildTransaction()]);
    const deliveryRepo = new FakeDeliveryRepository(null);
    const { useCase } = buildUseCase({
      transactionRepo,
      deliveryRepo,
      clock: new FakeClock(now),
      getQuoteUseCase: new FakeGetQuoteUseCase(okAsync(quote)),
    });

    const result = await useCase.execute(buildCommand({ expectedTotalInCents: 523_900 }));
    result._unsafeUnwrap();

    expect(transactionRepo.insertCalls).toHaveLength(1);
    const inserted = transactionRepo.insertCalls[0]!;
    expect(inserted.unitPriceInCents).toBe(500_000);
    expect(inserted.subtotalInCents).toBe(500_000);
    expect(inserted.baseFeeInCents).toBe(15_900);
    expect(inserted.deliveryFeeInCents).toBe(8_000);
    expect(inserted.totalInCents).toBe(523_900);
    expect(inserted.currency).toBe('COP');
    expect(inserted.reservationExpiresAt.getTime()).toBe(now.getTime() + RESERVATION_TTL_MS);

    expect(deliveryRepo.insertCalls).toHaveLength(1);
    const insertedDelivery = deliveryRepo.insertCalls[0]!;
    expect(insertedDelivery.warehouseId).toBe('warehouse-9');
    expect(insertedDelivery.distanceKm).toBe(12);
    expect(insertedDelivery.feeRule).toBe('NATIONAL_DISTANCE');
  });

  it('retries with a new reference on a reference collision and eventually succeeds', async () => {
    const transactionRepo = new FakeTransactionRepository(null, [
      { constraint: 'REFERENCE' },
      { constraint: 'REFERENCE' },
      buildTransaction(),
    ]);
    const { useCase } = buildUseCase({ transactionRepo, random: createSequentialRandom() });

    const result = await useCase.execute(buildCommand());
    result._unsafeUnwrap();

    expect(transactionRepo.insertAttempts).toBe(3);
    const references = transactionRepo.insertCalls.map((call) => call.reference);
    expect(new Set(references).size).toBe(3);
  });

  it('rejects after exhausting all reference attempts, never trying a 4th time', async () => {
    const transactionRepo = new FakeTransactionRepository(null, [
      { constraint: 'REFERENCE' },
      { constraint: 'REFERENCE' },
      { constraint: 'REFERENCE' },
    ]);
    const { useCase } = buildUseCase({ transactionRepo, random: createSequentialRandom() });

    await expect(useCase.execute(buildCommand())).rejects.toThrow();
    expect(transactionRepo.insertAttempts).toBe(3);
  });

  it('rolls back, re-reads and replays on an idempotency-key collision', async () => {
    const winner = buildTransaction({ id: 'transaction-winner', status: 'PENDING' });
    const winnerDelivery = buildDelivery({
      id: 'delivery-winner',
      transactionId: 'transaction-winner',
    });
    const transactionRepo = new FakeTransactionRepository(
      null,
      [{ constraint: 'IDEMPOTENCY_KEY' }],
      winner,
    );
    const deliveryRepo = new FakeDeliveryRepository(winnerDelivery);
    const stockReservation = new FakeStockReservation('RESERVED');
    const { useCase } = buildUseCase({ transactionRepo, deliveryRepo, stockReservation });

    const result = await useCase.execute(buildCommand());
    const outcome = result._unsafeUnwrap();

    expect(transactionRepo.insertAttempts).toBe(1);
    expect(transactionRepo.findByKeyCalls).toBe(2);
    expect(stockReservation.releaseCalls).toHaveLength(0);
    expect(stockReservation.commitCalls).toHaveLength(0);
    expect(outcome).toEqual({
      replayed: true,
      view: {
        id: winner.id,
        reference: winner.reference,
        status: winner.status,
        statusMessage: winner.providerStatusMessage,
        totalInCents: winner.totalInCents,
        currency: 'COP',
        delivery: { id: winnerDelivery.id, status: winnerDelivery.status },
        createdAt: winner.createdAt.toISOString(),
      },
    });
  });

  it('records the gateway response and stays PENDING when the gateway accepts the charge', async () => {
    const insertedTransaction = buildTransaction({ status: 'PENDING' });
    const transactionRepo = new FakeTransactionRepository(null, [insertedTransaction]);
    const deliveryRepo = new FakeDeliveryRepository(null);
    const unitOfWork = new FakeUnitOfWork();
    const paymentGateway = new FakePaymentGateway(
      true,
      okAsync(buildGatewayCharge({ providerTransactionId: 'gw-42', statusMessage: 'Pending' })),
      unitOfWork,
    );
    const { useCase } = buildUseCase({ transactionRepo, deliveryRepo, unitOfWork, paymentGateway });

    const result = await useCase.execute(buildCommand());
    const outcome = result._unsafeUnwrap();

    expect(transactionRepo.recordGatewayResponseCalls).toEqual([
      {
        id: insertedTransaction.id,
        providerTransactionId: 'gw-42',
        statusMessage: 'Pending',
      },
    ]);
    expect(outcome.view.status).toBe('PENDING');
    expect(outcome.view.statusMessage).toBe('Pending');
    expect(outcome.replayed).toBe(false);
    expect(paymentGateway.insideRunAtCreateCharge).toEqual([false]);
  });

  it('finalizes as ERROR with the gateway message when the charge is rejected', async () => {
    const insertedTransaction = buildTransaction({ status: 'PENDING' });
    const transactionRepo = new FakeTransactionRepository(null, [insertedTransaction]);
    const deliveryRepo = new FakeDeliveryRepository(null);
    const finalizeTransactionUseCase = new FakeFinalizeTransactionUseCase();
    const paymentGateway = new FakePaymentGateway(
      true,
      errAsync<GatewayCharge, PaymentGatewayError>({ kind: 'REJECTED', message: 'Invalid token' }),
    );
    const { useCase } = buildUseCase({
      transactionRepo,
      deliveryRepo,
      paymentGateway,
      finalizeTransactionUseCase,
    });

    const result = await useCase.execute(buildCommand());
    const outcome = result._unsafeUnwrap();

    expect(finalizeTransactionUseCase.calls).toEqual([
      { id: insertedTransaction.id, status: 'ERROR', statusMessage: 'Invalid token' },
    ]);
    expect(outcome.view.status).toBe('ERROR');
    expect(outcome.view.statusMessage).toBe('Invalid token');
    expect(transactionRepo.recordGatewayResponseCalls).toEqual([]);
  });

  it.each(['TIMEOUT', 'UNAVAILABLE'] as const)(
    'stays PENDING with no provider id on a %s gateway outcome',
    async (kind) => {
      const insertedTransaction = buildTransaction({ status: 'PENDING' });
      const transactionRepo = new FakeTransactionRepository(null, [insertedTransaction]);
      const deliveryRepo = new FakeDeliveryRepository(null);
      const finalizeTransactionUseCase = new FakeFinalizeTransactionUseCase();
      const paymentGateway = new FakePaymentGateway(
        true,
        errAsync<GatewayCharge, PaymentGatewayError>({ kind, message: 'gateway down' }),
      );
      const { useCase } = buildUseCase({
        transactionRepo,
        deliveryRepo,
        paymentGateway,
        finalizeTransactionUseCase,
      });

      const result = await useCase.execute(buildCommand());
      const outcome = result._unsafeUnwrap();

      expect(outcome.view.status).toBe('PENDING');
      expect(outcome.view.statusMessage).toBeNull();
      expect(transactionRepo.recordGatewayResponseCalls).toEqual([]);
      expect(finalizeTransactionUseCase.calls).toEqual([]);
    },
  );
});
