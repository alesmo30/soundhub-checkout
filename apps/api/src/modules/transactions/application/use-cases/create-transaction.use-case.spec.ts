import { ErrorCode } from '@checkout/shared/enums';
import type { Quote } from '@checkout/shared/contracts';

import type { Customer } from '../../../customers';
import type { CustomerRepository } from '../../../customers';
import type { Delivery } from '../../../deliveries';
import type { DeliveryRepository } from '../../../deliveries';
import type { GetQuoteUseCase } from '../../../pricing';
import { DomainError } from '../../../../shared/domain/domain-error';
import { err, errAsync, ok, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Transaction } from '../../domain/transaction';
import type { PaymentGatewayError, PaymentGatewayPort } from '../ports/payment-gateway.port';
import type { TransactionRepository } from '../ports/transaction.repository.port';
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

class FakeTransactionRepository implements TransactionRepository {
  calls = 0;

  constructor(private readonly existing: Transaction | null) {}

  findByIdempotencyKey(): ResultAsync<Transaction | null, never> {
    this.calls += 1;
    return okAsync(this.existing);
  }

  findById(): never {
    throw new Error('not used by this spec');
  }

  insert(): never {
    throw new Error('not used by this spec');
  }

  recordGatewayResponse(): never {
    throw new Error('not used by this spec');
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

  constructor(private readonly existing: Delivery | null) {}

  findByTransactionId(): ResultAsync<Delivery | null, never> {
    this.calls += 1;
    return okAsync(this.existing);
  }

  findById(): never {
    throw new Error('not used by this spec');
  }

  insert(): never {
    throw new Error('not used by this spec');
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

class FakePaymentGateway implements PaymentGatewayPort {
  calls = 0;

  constructor(private readonly available: boolean) {}

  ensureAvailable() {
    this.calls += 1;
    const failure: PaymentGatewayError = { kind: 'UNAVAILABLE', message: 'breaker open' };
    return this.available ? ok(undefined) : err(failure);
  }

  createCharge(): never {
    throw new Error('not used by this spec');
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

function buildUseCase(params: {
  transactionRepo?: FakeTransactionRepository;
  deliveryRepo?: FakeDeliveryRepository;
  customerRepo?: FakeCustomerRepository;
  paymentGateway?: FakePaymentGateway;
  getQuoteUseCase?: FakeGetQuoteUseCase;
}): {
  useCase: CreateTransactionUseCase;
  transactionRepo: FakeTransactionRepository;
  deliveryRepo: FakeDeliveryRepository;
  customerRepo: FakeCustomerRepository;
  paymentGateway: FakePaymentGateway;
  getQuoteUseCase: FakeGetQuoteUseCase;
} {
  const transactionRepo = params.transactionRepo ?? new FakeTransactionRepository(null);
  const deliveryRepo = params.deliveryRepo ?? new FakeDeliveryRepository(null);
  const customerRepo = params.customerRepo ?? new FakeCustomerRepository(buildCustomer());
  const paymentGateway = params.paymentGateway ?? new FakePaymentGateway(true);
  const getQuoteUseCase = params.getQuoteUseCase ?? new FakeGetQuoteUseCase(okAsync(buildQuote()));

  const useCase = new CreateTransactionUseCase({
    transactionRepository: transactionRepo,
    deliveryRepository: deliveryRepo,
    customerRepository: customerRepo,
    paymentGateway,
    getQuoteUseCase: getQuoteUseCase as unknown as GetQuoteUseCase,
  });

  return { useCase, transactionRepo, deliveryRepo, customerRepo, paymentGateway, getQuoteUseCase };
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
    expect(transactionRepo.calls).toBe(1);
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
});
