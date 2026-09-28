import { Logger } from '@nestjs/common';

import type { Product, ProductRepository } from '../../../catalog';
import type { Delivery, DeliveryRepository } from '../../../deliveries';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Transaction } from '../../domain/transaction';
import type {
  GatewayCharge,
  PaymentGatewayError,
  PaymentGatewayPort,
} from '../ports/payment-gateway.port';
import type { TransactionRepository } from '../ports/transaction.repository.port';
import type {
  FinalizeTransactionOutcome,
  FinalizeTransactionResult,
} from './finalize-transaction.use-case';
import { FinalizeTransactionUseCase } from './finalize-transaction.use-case';
import type { GetTransactionStatusDependencies } from './get-transaction-status.use-case';
import { GetTransactionStatusUseCase } from './get-transaction-status.use-case';

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    reference: 'TX-20260927-ABC123',
    idempotencyKey: 'idem-1',
    requestHash: '0'.repeat(64),
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 1,
    unitPriceInCents: 100_000,
    subtotalInCents: 100_000,
    baseFeeInCents: 0,
    deliveryFeeInCents: 0,
    totalInCents: 100_000,
    currency: 'COP',
    status: 'PENDING',
    installments: 1,
    cardBrand: 'VISA',
    cardLast4: '4242',
    providerTransactionId: null,
    providerStatusMessage: null,
    reservationExpiresAt: new Date('2026-09-27T20:05:00.000Z'),
    finalizedAt: null,
    emailSentAt: null,
    createdAt: new Date('2026-09-27T20:00:00.000Z'),
    updatedAt: new Date('2026-09-27T20:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

const PRODUCT: Product = {
  id: 'product-1',
  sku: 'SKU-1',
  name: 'Headphones',
  brand: 'Acme',
  description: 'Great headphones',
  priceInCents: 100_000,
  imageUrl: 'https://example.com/headphones.png',
  stockAvailable: 8,
  stockReserved: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const DELIVERY: Delivery = {
  id: 'delivery-1',
  transactionId: 'tx-1',
  warehouseId: 'warehouse-1',
  municipalityCode: '05001',
  status: 'AWAITING_PAYMENT',
  recipientName: 'Jane Doe',
  phone: '3000000000',
  addressLine: 'Calle 1 # 2-3',
  addressDetail: null,
  distanceKm: 5,
  feeRule: 'FREE_METRO',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
};

// Returns a queued transaction on each successive findById call, so specs
// can prove the re-read after finalize reflects whichever row is current
// at that moment (not the first-read object reused from memory).
class FakeTransactionRepository implements TransactionRepository {
  readonly calls: string[] = [];
  private readonly queue: (Transaction | null)[];

  constructor(...responses: (Transaction | null)[]) {
    this.queue = [...responses];
  }

  findById(id: string): ResultAsync<Transaction | null, never> {
    this.calls.push(id);
    const next = this.queue.length > 1 ? this.queue.shift() : this.queue[0];
    return okAsync(next ?? null);
  }

  // Unused port methods: this use case never calls them.
  findByIdempotencyKey(): never {
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

class FakeProductRepository implements ProductRepository {
  constructor(private readonly product: Product | null) {}

  findById(): ResultAsync<Product | null, never> {
    return okAsync(this.product);
  }

  findPage(): never {
    throw new Error('not used by this spec');
  }
}

class FakeDeliveryRepository implements DeliveryRepository {
  constructor(private readonly delivery: Delivery | null) {}

  findByTransactionId(): ResultAsync<Delivery | null, never> {
    return okAsync(this.delivery);
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

class FakePaymentGateway implements PaymentGatewayPort {
  readonly calls: string[] = [];

  constructor(
    private readonly result: ResultAsync<GatewayCharge, PaymentGatewayError>,
    private readonly callOrder: string[] = [],
  ) {}

  getCharge(providerTransactionId: string): ResultAsync<GatewayCharge, PaymentGatewayError> {
    this.calls.push(providerTransactionId);
    this.callOrder.push('getCharge');
    return this.result;
  }

  ensureAvailable(): never {
    throw new Error('not used by this spec');
  }

  createCharge(): never {
    throw new Error('not used by this spec');
  }

  findChargeByReference(): never {
    throw new Error('not used by this spec');
  }
}

// FinalizeTransactionUseCase has a private `deps` field, so no plain object
// structurally satisfies it (same stand-in pattern as
// create-transaction.use-case.spec.ts's FakeFinalizeTransactionUseCase);
// the cast at the call site is the only place that needs it.
class FakeFinalizeTransactionUseCase {
  readonly calls: FinalizeTransactionOutcome[] = [];

  constructor(
    private readonly result: FinalizeTransactionResult = 'FINALIZED',
    private readonly callOrder: string[] = [],
  ) {}

  execute(outcome: FinalizeTransactionOutcome): ResultAsync<FinalizeTransactionResult, never> {
    this.calls.push(outcome);
    this.callOrder.push('finalize');
    return okAsync(this.result);
  }
}

interface ExecutableFinalizer {
  execute(outcome: FinalizeTransactionOutcome): ResultAsync<FinalizeTransactionResult, never>;
}

function buildUseCase(params: {
  transactionRepository: TransactionRepository;
  paymentGateway: PaymentGatewayPort;
  finalizeTransactionUseCase: ExecutableFinalizer;
  productRepository: ProductRepository;
  deliveryRepository: DeliveryRepository;
}): GetTransactionStatusUseCase {
  return new GetTransactionStatusUseCase({
    transactionRepository: params.transactionRepository,
    paymentGateway: params.paymentGateway,
    finalizeTransactionUseCase:
      params.finalizeTransactionUseCase as unknown as FinalizeTransactionUseCase,
    productRepository: params.productRepository,
    deliveryRepository: params.deliveryRepository,
  });
}

function gatewayCharge(overrides: Partial<GatewayCharge> = {}): GatewayCharge {
  return {
    providerTransactionId: 'provider-1',
    status: 'PENDING',
    statusMessage: null,
    cardBrand: 'VISA',
    cardLast4: '4242',
    ...overrides,
  };
}

class UnreachableGateway implements PaymentGatewayPort {
  getCharge(): ResultAsync<GatewayCharge, PaymentGatewayError> {
    throw new Error('gateway must not be called for this sync branch');
  }

  ensureAvailable(): never {
    throw new Error('not used by this spec');
  }

  createCharge(): never {
    throw new Error('not used by this spec');
  }

  findChargeByReference(): never {
    throw new Error('not used by this spec');
  }
}

function unreachableGateway(): PaymentGatewayPort {
  return new UnreachableGateway();
}

function unreachableFinalizer(): ExecutableFinalizer {
  return {
    execute(): ResultAsync<FinalizeTransactionResult, never> {
      throw new Error('finalize must not be called for this sync branch');
    },
  };
}

describe('GetTransactionStatusUseCase', () => {
  it('returns TRANSACTION_NOT_FOUND for an unknown id', async () => {
    const useCase = buildUseCase({
      transactionRepository: new FakeTransactionRepository(null),
      paymentGateway: unreachableGateway(),
      finalizeTransactionUseCase: unreachableFinalizer(),
      productRepository: new FakeProductRepository(PRODUCT),
      deliveryRepository: new FakeDeliveryRepository(DELIVERY),
    });

    const result = await useCase.execute('unknown-id');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('does not call the gateway for an already-final transaction', async () => {
    const transaction = buildTransaction({
      status: 'APPROVED',
      providerTransactionId: 'provider-1',
    });
    const gateway = unreachableGateway();
    const useCase = buildUseCase({
      transactionRepository: new FakeTransactionRepository(transaction),
      paymentGateway: gateway,
      finalizeTransactionUseCase: unreachableFinalizer(),
      productRepository: new FakeProductRepository(PRODUCT),
      deliveryRepository: new FakeDeliveryRepository(DELIVERY),
    });

    const result = await useCase.execute('tx-1');

    expect(result._unsafeUnwrap().status).toBe('APPROVED');
  });

  it('does not call the gateway for a PENDING transaction without a provider id', async () => {
    const transaction = buildTransaction({ status: 'PENDING', providerTransactionId: null });
    const useCase = buildUseCase({
      transactionRepository: new FakeTransactionRepository(transaction),
      paymentGateway: unreachableGateway(),
      finalizeTransactionUseCase: unreachableFinalizer(),
      productRepository: new FakeProductRepository(PRODUCT),
      deliveryRepository: new FakeDeliveryRepository(DELIVERY),
    });

    const result = await useCase.execute('tx-1');

    expect(result._unsafeUnwrap().status).toBe('PENDING');
  });

  it('keeps the stored PENDING when the gateway reports PENDING', async () => {
    const transaction = buildTransaction({
      status: 'PENDING',
      providerTransactionId: 'provider-1',
    });
    const gateway = new FakePaymentGateway(okAsync(gatewayCharge({ status: 'PENDING' })));
    const useCase = buildUseCase({
      transactionRepository: new FakeTransactionRepository(transaction),
      paymentGateway: gateway,
      finalizeTransactionUseCase: unreachableFinalizer(),
      productRepository: new FakeProductRepository(PRODUCT),
      deliveryRepository: new FakeDeliveryRepository(DELIVERY),
    });

    const result = await useCase.execute('tx-1');

    expect(result._unsafeUnwrap().status).toBe('PENDING');
    expect(gateway.calls).toEqual(['provider-1']);
  });

  it('finalizes and re-reads when the gateway reports a final status, reflecting whichever status won', async () => {
    const stored = buildTransaction({ status: 'PENDING', providerTransactionId: 'provider-1' });
    // The re-read intentionally differs from the first read (DECLINED,
    // finalized by a racing webhook) so the assertion below can only pass
    // if the use case really re-reads instead of reusing the first object.
    const reread = buildTransaction({
      status: 'DECLINED',
      providerTransactionId: 'provider-1',
      providerStatusMessage: 'Insufficient funds',
      finalizedAt: new Date('2026-09-27T20:02:00.000Z'),
    });
    const callOrder: string[] = [];
    const gateway = new FakePaymentGateway(
      okAsync(gatewayCharge({ status: 'APPROVED', statusMessage: 'Approved' })),
      callOrder,
    );
    const finalizer = new FakeFinalizeTransactionUseCase('FINALIZED', callOrder);
    const useCase = buildUseCase({
      transactionRepository: new FakeTransactionRepository(stored, reread),
      paymentGateway: gateway,
      finalizeTransactionUseCase: finalizer,
      productRepository: new FakeProductRepository(PRODUCT),
      deliveryRepository: new FakeDeliveryRepository(DELIVERY),
    });

    const result = await useCase.execute('tx-1');

    expect(finalizer.calls).toEqual([
      { id: 'tx-1', status: 'APPROVED', statusMessage: 'Approved' },
    ]);
    expect(result._unsafeUnwrap().status).toBe('DECLINED');
    expect(result._unsafeUnwrap().statusMessage).toBe('Insufficient funds');
    // getCharge resolves strictly before finalize is called.
    expect(callOrder).toEqual(['getCharge', 'finalize']);
  });

  it.each(['UNAVAILABLE', 'TIMEOUT', 'REJECTED'] as const)(
    'logs a warning and keeps the stored PENDING when the gateway returns %s',
    async (kind) => {
      const transaction = buildTransaction({
        status: 'PENDING',
        providerTransactionId: 'provider-1',
      });
      const gateway = new FakePaymentGateway(errAsync({ kind, message: 'gateway error' }));
      const useCase = buildUseCase({
        transactionRepository: new FakeTransactionRepository(transaction),
        paymentGateway: gateway,
        finalizeTransactionUseCase: unreachableFinalizer(),
        productRepository: new FakeProductRepository(PRODUCT),
        deliveryRepository: new FakeDeliveryRepository(DELIVERY),
      });
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      const result = await useCase.execute('tx-1');

      expect(result._unsafeUnwrap().status).toBe('PENDING');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain(kind);

      warnSpy.mockRestore();
    },
  );

  it('logs an error and rejects when the product is missing', async () => {
    const transaction = buildTransaction({ status: 'APPROVED' });
    const useCase = buildUseCase({
      transactionRepository: new FakeTransactionRepository(transaction),
      paymentGateway: unreachableGateway(),
      finalizeTransactionUseCase: unreachableFinalizer(),
      productRepository: new FakeProductRepository(null),
      deliveryRepository: new FakeDeliveryRepository(DELIVERY),
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(useCase.execute('tx-1')).rejects.toThrow(/missing product/);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('logs an error and rejects when the delivery is missing', async () => {
    const transaction = buildTransaction({ status: 'APPROVED' });
    const useCase = buildUseCase({
      transactionRepository: new FakeTransactionRepository(transaction),
      paymentGateway: unreachableGateway(),
      finalizeTransactionUseCase: unreachableFinalizer(),
      productRepository: new FakeProductRepository(PRODUCT),
      deliveryRepository: new FakeDeliveryRepository(null),
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(useCase.execute('tx-1')).rejects.toThrow(/missing delivery/);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });
});

// Type-level proof (references/layering.md — only FinalizeTransactionUseCase
// opens a UnitOfWork): GetTransactionStatusDependencies has no unitOfWork
// field, so nothing in this use case could call unitOfWork.run even by
// mistake. A field named 'unitOfWork' added to the dependencies interface
// would make this assignment fail to compile.
type AssertNoUnitOfWork = 'unitOfWork' extends keyof GetTransactionStatusDependencies
  ? never
  : true;
const assertNoUnitOfWork: AssertNoUnitOfWork = true;
void assertNoUnitOfWork;
