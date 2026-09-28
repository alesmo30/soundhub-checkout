import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
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
import type { FinalizeTransactionUseCase } from './finalize-transaction.use-case';
import type { ReconcileTransactionsDependencies } from './reconcile-transactions.use-case';
import { ReconcileTransactionsUseCase } from './reconcile-transactions.use-case';

class FakeClock implements Clock {
  private value: Date;

  constructor(initial: Date = new Date('2026-09-27T00:00:00.000Z')) {
    this.value = initial;
  }

  now(): Date {
    return this.value;
  }

  advanceMs(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

class FakeUnitOfWork implements UnitOfWork {
  readonly tx: TxContext = { __brand: 'TxContext' };
  runCount = 0;
  insideRun = false;

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    this.runCount += 1;
    this.insideRun = true;
    return work(this.tx).map((value) => {
      this.insideRun = false;
      return value;
    }) as ResultAsync<T, E>;
  }
}

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    reference: 'TX-1',
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
    providerTransactionId: 'gw-1',
    providerStatusMessage: null,
    reservationExpiresAt: new Date(),
    finalizedAt: null,
    emailSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

class FakeTransactionRepository implements TransactionRepository {
  claimPendingForSyncCalls: Array<{ olderThan: Date; limit: number }> = [];

  constructor(private readonly toClaim: Transaction[] = []) {}

  claimPendingForSync(_tx: TxContext, query: { olderThan: Date; limit: number }) {
    this.claimPendingForSyncCalls.push(query);
    return okAsync(this.toClaim);
  }

  claimExpiredReservations() {
    return okAsync<Transaction[], never>([]);
  }

  findUnsentEmails() {
    return okAsync<Transaction[], never>([]);
  }

  findByProviderTransactionId(): never {
    throw new Error('not used by this spec');
  }

  findById(): never {
    throw new Error('not used by this spec');
  }

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
}

function gatewayCharge(overrides: Partial<GatewayCharge> = {}): GatewayCharge {
  return {
    providerTransactionId: 'gw-1',
    status: 'APPROVED',
    statusMessage: null,
    cardBrand: 'VISA',
    cardLast4: '4242',
    ...overrides,
  };
}

class FakePaymentGateway implements PaymentGatewayPort {
  getChargeCalls: string[] = [];
  private readonly insideUnitOfWorkAtCall: boolean[] = [];

  constructor(
    private readonly results: Array<
      { readonly ok: true; readonly charge: GatewayCharge } | { readonly ok: false }
    > = [],
    private readonly unitOfWork?: FakeUnitOfWork,
  ) {}

  getCharge(providerTransactionId: string): ResultAsync<GatewayCharge, PaymentGatewayError> {
    this.getChargeCalls.push(providerTransactionId);
    this.insideUnitOfWorkAtCall.push(this.unitOfWork?.insideRun ?? false);
    const result = this.results[this.getChargeCalls.length - 1] ?? { ok: true, charge: gatewayCharge() };
    return result.ok
      ? okAsync(result.charge)
      : errAsync<GatewayCharge, PaymentGatewayError>({ kind: 'UNAVAILABLE', message: 'boom' });
  }

  wasEverCalledInsideUnitOfWork(): boolean {
    return this.insideUnitOfWorkAtCall.some(Boolean);
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

class FakeFinalizeTransactionUseCase {
  readonly calls: FinalizeTransactionOutcome[] = [];

  execute(outcome: FinalizeTransactionOutcome) {
    this.calls.push(outcome);
    return okAsync<FinalizeTransactionResult, never>('FINALIZED');
  }
}

class UnreachableFinalizer {
  execute(): never {
    throw new Error('finalize must not be called for this branch');
  }
}

function buildUseCase(params: {
  toClaim?: Transaction[];
  gatewayResults?: Array<{ readonly ok: true; readonly charge: GatewayCharge } | { readonly ok: false }>;
  finalizeTransactionUseCase?: { execute: FinalizeTransactionUseCase['execute'] };
  clock?: FakeClock;
  unitOfWork?: FakeUnitOfWork;
}): {
  useCase: ReconcileTransactionsUseCase;
  repository: FakeTransactionRepository;
  gateway: FakePaymentGateway;
  unitOfWork: FakeUnitOfWork;
} {
  const unitOfWork = params.unitOfWork ?? new FakeUnitOfWork();
  const gateway = new FakePaymentGateway(params.gatewayResults, unitOfWork);
  const repository = new FakeTransactionRepository(params.toClaim ?? []);
  const finalizeTransactionUseCase = params.finalizeTransactionUseCase ?? new FakeFinalizeTransactionUseCase();

  const dependencies: ReconcileTransactionsDependencies = {
    transactionRepository: repository,
    paymentGateway: gateway,
    finalizeTransactionUseCase: finalizeTransactionUseCase as unknown as FinalizeTransactionUseCase,
    unitOfWork,
    clock: params.clock ?? new FakeClock(),
    eventPublisher: { publish: () => okAsync(undefined) },
  };

  return { useCase: new ReconcileTransactionsUseCase(dependencies), repository, gateway, unitOfWork };
}

describe('ReconcileTransactionsUseCase — sync task', () => {
  it('finalizes a transaction with a final gateway status, counting it as synced', async () => {
    const transaction = buildTransaction();
    const finalizer = new FakeFinalizeTransactionUseCase();
    const { useCase } = buildUseCase({
      toClaim: [transaction],
      gatewayResults: [{ ok: true, charge: gatewayCharge({ status: 'APPROVED' }) }],
      finalizeTransactionUseCase: finalizer,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.synced).toBe(1);
    expect(summary.failed).toBe(0);
    expect(finalizer.calls).toEqual([
      { id: transaction.id, status: 'APPROVED', statusMessage: null },
    ]);
  });

  it('does nothing for a PENDING gateway status', async () => {
    const finalizer = new UnreachableFinalizer();
    const { useCase } = buildUseCase({
      toClaim: [buildTransaction()],
      gatewayResults: [{ ok: true, charge: gatewayCharge({ status: 'PENDING' }) }],
      finalizeTransactionUseCase: finalizer,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.synced).toBe(0);
    expect(summary.failed).toBe(0);
  });

  it('counts a gateway Err as failed, without finalizing', async () => {
    const finalizer = new UnreachableFinalizer();
    const { useCase } = buildUseCase({
      toClaim: [buildTransaction()],
      gatewayResults: [{ ok: false }],
      finalizeTransactionUseCase: finalizer,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.failed).toBe(1);
    expect(summary.synced).toBe(0);
  });

  it('claims in its own unit of work, and never calls the gateway while it is open', async () => {
    const { useCase, gateway, unitOfWork } = buildUseCase({
      toClaim: [buildTransaction()],
      gatewayResults: [{ ok: true, charge: gatewayCharge({ status: 'APPROVED' }) }],
    });

    await useCase.execute();

    expect(unitOfWork.runCount).toBeGreaterThan(0);
    expect(gateway.wasEverCalledInsideUnitOfWork()).toBe(false);
  });

  it('stops making gateway calls once the time budget is spent, reporting the rest as deferred', async () => {
    const clock = new FakeClock();
    const transactions = Array.from({ length: 20 }, (_, index) =>
      buildTransaction({ id: `tx-${index + 1}`, providerTransactionId: `gw-${index + 1}` }),
    );
    let calls = 0;
    const unitOfWork = new FakeUnitOfWork();
    const gateway = new FakePaymentGateway(undefined, unitOfWork);
    // Advances the clock past the 30 s budget right after the 3rd getCharge
    // call resolves, so the budget check before the 4th call (not the 4th
    // call itself) is what stops the loop.
    const originalGetCharge = gateway.getCharge.bind(gateway);
    gateway.getCharge = (providerTransactionId: string) => {
      calls += 1;
      const result = originalGetCharge(providerTransactionId);
      if (calls === 3) {
        clock.advanceMs(31_000);
      }
      return result;
    };

    const repository = new FakeTransactionRepository(transactions);
    const finalizer = new FakeFinalizeTransactionUseCase();
    const dependencies: ReconcileTransactionsDependencies = {
      transactionRepository: repository,
      paymentGateway: gateway,
      finalizeTransactionUseCase: finalizer as unknown as FinalizeTransactionUseCase,
      unitOfWork,
      clock,
      eventPublisher: { publish: () => okAsync(undefined) },
    };
    const useCase = new ReconcileTransactionsUseCase(dependencies);

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(gateway.getChargeCalls).toHaveLength(3);
    expect(summary.deferred).toBe(17);
  });
});
