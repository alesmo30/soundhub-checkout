import { TransactionStatus } from '@checkout/shared/enums';

import { okAsync } from '../../../../shared/domain/result';
import type { Transaction } from '../../domain/transaction';
import type { TransactionRepository } from '../ports/transaction.repository.port';
import type {
  FinalizeTransactionOutcome,
  FinalizeTransactionResult,
} from './finalize-transaction.use-case';
import type { FinalizeTransactionUseCase } from './finalize-transaction.use-case';
import type {
  HandlePaymentWebhookDependencies,
  PaymentWebhookEvent,
} from './handle-payment-webhook.use-case';
import { HandlePaymentWebhookUseCase } from './handle-payment-webhook.use-case';

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
  findByProviderTransactionIdCalls: string[] = [];

  constructor(private readonly existing: Transaction | null) {}

  findByProviderTransactionId(providerTransactionId: string) {
    this.findByProviderTransactionIdCalls.push(providerTransactionId);
    return okAsync(this.existing);
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

// FinalizeTransactionUseCase has a private `deps` field, so no plain object
// structurally satisfies it (same stand-in pattern as
// get-transaction-status.use-case.spec.ts's FakeFinalizeTransactionUseCase);
// the cast at the call site is the only place that needs it.
class FakeFinalizeTransactionUseCase {
  readonly calls: FinalizeTransactionOutcome[] = [];

  constructor(private readonly result: FinalizeTransactionResult = 'FINALIZED') {}

  execute(outcome: FinalizeTransactionOutcome) {
    this.calls.push(outcome);
    return okAsync(this.result);
  }
}

class UnreachableFinalizer {
  execute(): never {
    throw new Error('the gateway/finalizer must not be called for this branch');
  }
}

function buildUseCase(deps: {
  transactionRepository: TransactionRepository;
  finalizeTransactionUseCase: { execute: FinalizeTransactionUseCase['execute'] };
}): HandlePaymentWebhookUseCase {
  const dependencies: HandlePaymentWebhookDependencies = {
    transactionRepository: deps.transactionRepository,
    finalizeTransactionUseCase:
      deps.finalizeTransactionUseCase as unknown as FinalizeTransactionUseCase,
  };
  return new HandlePaymentWebhookUseCase(dependencies);
}

function buildEvent(overrides: Partial<PaymentWebhookEvent> = {}): PaymentWebhookEvent {
  return {
    type: 'transaction.updated',
    providerTransactionId: 'gw-1',
    status: TransactionStatus.APPROVED,
    statusMessage: null,
    ...overrides,
  };
}

describe('HandlePaymentWebhookUseCase', () => {
  it('ignores an event type other than transaction.updated, with no repository call', async () => {
    const repository = new FakeTransactionRepository(null);
    const useCase = buildUseCase({
      transactionRepository: repository,
      finalizeTransactionUseCase: new UnreachableFinalizer(),
    });

    const result = await useCase.execute(buildEvent({ type: 'transaction.created' }));

    expect(result._unsafeUnwrap()).toBe('IGNORED');
    expect(repository.findByProviderTransactionIdCalls).toEqual([]);
  });

  it('returns UNKNOWN_TRANSACTION when the provider id is not found', async () => {
    const repository = new FakeTransactionRepository(null);
    const useCase = buildUseCase({
      transactionRepository: repository,
      finalizeTransactionUseCase: new UnreachableFinalizer(),
    });

    const result = await useCase.execute(buildEvent());

    expect(result._unsafeUnwrap()).toBe('UNKNOWN_TRANSACTION');
  });

  it('ignores a PENDING status, with no finalize call', async () => {
    const repository = new FakeTransactionRepository(buildTransaction());
    const finalizer = new UnreachableFinalizer();
    const useCase = buildUseCase({
      transactionRepository: repository,
      finalizeTransactionUseCase: finalizer,
    });

    const result = await useCase.execute(buildEvent({ status: TransactionStatus.PENDING }));

    expect(result._unsafeUnwrap()).toBe('IGNORED');
  });

  it.each([
    TransactionStatus.APPROVED,
    TransactionStatus.DECLINED,
    TransactionStatus.VOIDED,
    TransactionStatus.ERROR,
  ])('finalizes with %s and returns FINALIZED', async (status) => {
    const transaction = buildTransaction();
    const repository = new FakeTransactionRepository(transaction);
    const finalizer = new FakeFinalizeTransactionUseCase('FINALIZED');
    const useCase = buildUseCase({
      transactionRepository: repository,
      finalizeTransactionUseCase: finalizer,
    });

    const result = await useCase.execute(buildEvent({ status, statusMessage: 'from gateway' }));

    expect(result._unsafeUnwrap()).toBe('FINALIZED');
    expect(finalizer.calls).toEqual([
      { id: transaction.id, status, statusMessage: 'from gateway' },
    ]);
  });

  it('returns ALREADY_FINAL on a replay', async () => {
    const repository = new FakeTransactionRepository(buildTransaction());
    const finalizer = new FakeFinalizeTransactionUseCase('ALREADY_FINAL');
    const useCase = buildUseCase({
      transactionRepository: repository,
      finalizeTransactionUseCase: finalizer,
    });

    const result = await useCase.execute(buildEvent());

    expect(result._unsafeUnwrap()).toBe('ALREADY_FINAL');
  });
});
