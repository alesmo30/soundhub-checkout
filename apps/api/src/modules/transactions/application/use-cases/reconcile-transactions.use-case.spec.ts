import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { TransactionFinalizedEvent } from '../../domain/transaction-finalized.event';
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
  claimExpiredReservationsCalls: Array<{ now: Date; limit: number }> = [];
  recordGatewayResponseCalls: Array<{
    id: string;
    providerTransactionId: string;
    statusMessage: string | null;
  }> = [];
  markEmailSentCalls: string[] = [];

  constructor(
    private readonly toClaim: Transaction[] = [],
    private readonly toClaimExpired: Transaction[] = [],
    private readonly toFindUnsentEmails: Transaction[] = [],
  ) {}

  claimPendingForSync(_tx: TxContext, query: { olderThan: Date; limit: number }) {
    this.claimPendingForSyncCalls.push(query);
    return okAsync(this.toClaim);
  }

  claimExpiredReservations(_tx: TxContext, query: { now: Date; limit: number }) {
    this.claimExpiredReservationsCalls.push(query);
    return okAsync(this.toClaimExpired);
  }

  findUnsentEmails() {
    return okAsync(this.toFindUnsentEmails);
  }

  recordGatewayResponse(
    _tx: TxContext,
    response: { id: string; providerTransactionId: string; statusMessage: string | null },
  ) {
    this.recordGatewayResponseCalls.push(response);
    return okAsync<void, never>(undefined);
  }

  markEmailSent(_tx: TxContext, id: string) {
    this.markEmailSentCalls.push(id);
    return okAsync<void, never>(undefined);
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

  finalize(): never {
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

type GatewayCallResult =
  | { readonly ok: true; readonly charge: GatewayCharge }
  | { readonly ok: false };

type ReferenceLookupResult =
  | { readonly ok: true; readonly charge: GatewayCharge | null }
  | { readonly ok: false };

class FakePaymentGateway implements PaymentGatewayPort {
  getChargeCalls: string[] = [];
  findChargeByReferenceCalls: string[] = [];
  private readonly insideUnitOfWorkAtCall: boolean[] = [];

  constructor(
    private readonly results: GatewayCallResult[] = [],
    private readonly unitOfWork?: FakeUnitOfWork,
    private readonly referenceResults: ReferenceLookupResult[] = [],
  ) {}

  getCharge(providerTransactionId: string): ResultAsync<GatewayCharge, PaymentGatewayError> {
    this.getChargeCalls.push(providerTransactionId);
    this.insideUnitOfWorkAtCall.push(this.unitOfWork?.insideRun ?? false);
    const result = this.results[this.getChargeCalls.length - 1] ?? { ok: true, charge: gatewayCharge() };
    return result.ok
      ? okAsync(result.charge)
      : errAsync<GatewayCharge, PaymentGatewayError>({ kind: 'UNAVAILABLE', message: 'boom' });
  }

  findChargeByReference(reference: string): ResultAsync<GatewayCharge | null, PaymentGatewayError> {
    this.findChargeByReferenceCalls.push(reference);
    const result = this.referenceResults[this.findChargeByReferenceCalls.length - 1] ?? {
      ok: true,
      charge: null,
    };
    return result.ok
      ? okAsync(result.charge)
      : errAsync<GatewayCharge | null, PaymentGatewayError>({ kind: 'UNAVAILABLE', message: 'boom' });
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
}

interface PublishCall {
  readonly event: TransactionFinalizedEvent;
}

class FakeEventPublisher {
  readonly calls: PublishCall[] = [];

  constructor(private readonly results: Array<{ readonly ok: boolean }> = []) {}

  publish(event: TransactionFinalizedEvent) {
    this.calls.push({ event });
    const result = this.results[this.calls.length - 1] ?? { ok: true };
    return result.ok
      ? okAsync<void, { message: string }>(undefined)
      : errAsync<void, { message: string }>({ message: 'publish failed' });
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
  toClaimExpired?: Transaction[];
  toFindUnsentEmails?: Transaction[];
  gatewayResults?: GatewayCallResult[];
  referenceResults?: ReferenceLookupResult[];
  finalizeTransactionUseCase?: { execute: FinalizeTransactionUseCase['execute'] };
  eventPublisher?: FakeEventPublisher;
  clock?: FakeClock;
  unitOfWork?: FakeUnitOfWork;
}): {
  useCase: ReconcileTransactionsUseCase;
  repository: FakeTransactionRepository;
  gateway: FakePaymentGateway;
  eventPublisher: FakeEventPublisher;
  unitOfWork: FakeUnitOfWork;
} {
  const unitOfWork = params.unitOfWork ?? new FakeUnitOfWork();
  const gateway = new FakePaymentGateway(params.gatewayResults, unitOfWork, params.referenceResults);
  const repository = new FakeTransactionRepository(
    params.toClaim ?? [],
    params.toClaimExpired ?? [],
    params.toFindUnsentEmails ?? [],
  );
  const finalizeTransactionUseCase = params.finalizeTransactionUseCase ?? new FakeFinalizeTransactionUseCase();
  const eventPublisher = params.eventPublisher ?? new FakeEventPublisher();

  const dependencies: ReconcileTransactionsDependencies = {
    transactionRepository: repository,
    paymentGateway: gateway,
    finalizeTransactionUseCase: finalizeTransactionUseCase as unknown as FinalizeTransactionUseCase,
    unitOfWork,
    clock: params.clock ?? new FakeClock(),
    eventPublisher,
  };

  return {
    useCase: new ReconcileTransactionsUseCase(dependencies),
    repository,
    gateway,
    eventPublisher,
    unitOfWork,
  };
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

describe('ReconcileTransactionsUseCase — safe expiry task', () => {
  it('finalizes EXPIRED when no charge is found by reference', async () => {
    const transaction = buildTransaction({ providerTransactionId: null });
    const finalizer = new FakeFinalizeTransactionUseCase();
    const { useCase } = buildUseCase({
      toClaimExpired: [transaction],
      referenceResults: [{ ok: true, charge: null }],
      finalizeTransactionUseCase: finalizer,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.expired).toBe(1);
    expect(finalizer.calls).toEqual([
      {
        id: transaction.id,
        status: 'EXPIRED',
        statusMessage: 'Reservation expired before reaching the payment gateway',
      },
    ]);
  });

  it('records the provider id and finalizes when a final charge is found by reference', async () => {
    const transaction = buildTransaction({ providerTransactionId: null });
    const finalizer = new FakeFinalizeTransactionUseCase();
    const { useCase, repository } = buildUseCase({
      toClaimExpired: [transaction],
      referenceResults: [
        { ok: true, charge: gatewayCharge({ providerTransactionId: 'gw-recovered', status: 'APPROVED' }) },
      ],
      finalizeTransactionUseCase: finalizer,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.recovered).toBe(1);
    expect(summary.expired).toBe(0);
    expect(repository.recordGatewayResponseCalls).toEqual([
      { id: transaction.id, providerTransactionId: 'gw-recovered', statusMessage: null },
    ]);
    expect(finalizer.calls).toEqual([
      { id: transaction.id, status: 'APPROVED', statusMessage: null },
    ]);
  });

  it('records the provider id but does not finalize when the found charge is still PENDING', async () => {
    const transaction = buildTransaction({ providerTransactionId: null });
    const finalizer = new UnreachableFinalizer();
    const { useCase, repository } = buildUseCase({
      toClaimExpired: [transaction],
      referenceResults: [
        { ok: true, charge: gatewayCharge({ providerTransactionId: 'gw-pending', status: 'PENDING' }) },
      ],
      finalizeTransactionUseCase: finalizer,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.recovered).toBe(1);
    expect(repository.recordGatewayResponseCalls).toHaveLength(1);
  });

  it('touches nothing and counts failed on a gateway Err', async () => {
    const transaction = buildTransaction({ providerTransactionId: null });
    const finalizer = new UnreachableFinalizer();
    const { useCase, repository } = buildUseCase({
      toClaimExpired: [transaction],
      referenceResults: [{ ok: false }],
      finalizeTransactionUseCase: finalizer,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.failed).toBe(1);
    expect(summary.expired).toBe(0);
    expect(summary.recovered).toBe(0);
    expect(repository.recordGatewayResponseCalls).toEqual([]);
  });

  it('shares the time budget with the sync task', async () => {
    const clock = new FakeClock();
    const syncTransaction = buildTransaction({ id: 'tx-sync' });
    const expiredTransactions = Array.from({ length: 5 }, (_, index) =>
      buildTransaction({ id: `tx-expired-${index + 1}`, providerTransactionId: null }),
    );
    const unitOfWork = new FakeUnitOfWork();
    const gateway = new FakePaymentGateway(
      [{ ok: true, charge: gatewayCharge({ status: 'PENDING' }) }],
      unitOfWork,
      [],
    );
    const originalGetCharge = gateway.getCharge.bind(gateway);
    gateway.getCharge = (id: string) => {
      const result = originalGetCharge(id);
      clock.advanceMs(31_000);
      return result;
    };
    const repository = new FakeTransactionRepository([syncTransaction], expiredTransactions);
    const finalizer = new UnreachableFinalizer();
    const eventPublisher = new FakeEventPublisher();
    const dependencies: ReconcileTransactionsDependencies = {
      transactionRepository: repository,
      paymentGateway: gateway,
      finalizeTransactionUseCase: finalizer as unknown as FinalizeTransactionUseCase,
      unitOfWork,
      clock,
      eventPublisher,
    };
    const useCase = new ReconcileTransactionsUseCase(dependencies);

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(gateway.findChargeByReferenceCalls).toHaveLength(0);
    expect(summary.deferred).toBe(5);
  });
});

describe('ReconcileTransactionsUseCase — re-publish task', () => {
  it('publishes transaction.finalized for each unsent-email row, EXPIRED included, and marks the email sent', async () => {
    const transaction = buildTransaction({ status: 'EXPIRED' });
    const eventPublisher = new FakeEventPublisher();
    const { useCase, repository } = buildUseCase({
      toFindUnsentEmails: [transaction],
      eventPublisher,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.republished).toBe(1);
    expect(eventPublisher.calls).toEqual([
      {
        event: {
          type: 'transaction.finalized',
          transactionId: transaction.id,
          status: 'EXPIRED',
          occurredAt: expect.any(Date),
        },
      },
    ]);
    expect(repository.markEmailSentCalls).toEqual([transaction.id]);
  });

  it('logs a warn and continues when a publish fails, without marking that row sent', async () => {
    const failing = buildTransaction({ id: 'tx-fail' });
    const succeeding = buildTransaction({ id: 'tx-ok' });
    const eventPublisher = new FakeEventPublisher([{ ok: false }, { ok: true }]);
    const { useCase, repository } = buildUseCase({
      toFindUnsentEmails: [failing, succeeding],
      eventPublisher,
    });

    const summary = (await useCase.execute())._unsafeUnwrap();

    expect(summary.republished).toBe(1);
    expect(repository.markEmailSentCalls).toEqual(['tx-ok']);
  });
});
