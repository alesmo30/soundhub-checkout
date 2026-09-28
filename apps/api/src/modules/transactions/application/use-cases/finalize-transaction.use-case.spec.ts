import type { DeliveryRepository } from '../../../deliveries';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { StockLine, StockReservationPort } from '../ports/stock-reservation.port';
import type { TransactionRepository } from '../ports/transaction.repository.port';
import { FinalizeTransactionUseCase } from './finalize-transaction.use-case';

const TRANSACTION_ID = 'transaction-1';
const STOCK_LINE: StockLine = { productId: 'product-1', quantity: 2 };

type Call = { readonly name: string; readonly tx: TxContext; readonly args: unknown };

// Records every call it receives, including the tx it was handed, so the
// specs can assert both the sequence and that all three ports shared the
// same UnitOfWork.run() transaction.
class RecordingPorts implements TransactionRepository, StockReservationPort, DeliveryRepository {
  readonly calls: Call[] = [];
  private finalizeReturn: StockLine | null = STOCK_LINE;

  queueFinalizeReturn(value: StockLine | null): void {
    this.finalizeReturn = value;
  }

  finalize(
    tx: TxContext,
    outcome: { id: string; status: string; statusMessage: string | null },
  ): ResultAsync<StockLine | null, never> {
    this.calls.push({ name: 'finalize', tx, args: outcome });
    return okAsync(this.finalizeReturn);
  }

  release(tx: TxContext, line: StockLine): ResultAsync<void, never> {
    this.calls.push({ name: 'release', tx, args: line });
    return okAsync(undefined);
  }

  transition(
    tx: TxContext,
    change: { transactionId: string; to: 'READY_TO_SHIP' | 'CANCELLED' },
  ): ResultAsync<void, never> {
    this.calls.push({ name: 'transition', tx, args: change });
    return okAsync(undefined);
  }

  // Unused port methods: this use case never calls them.
  findById(): never {
    throw new Error('not used by this spec');
  }

  findByIdempotencyKey(): never {
    throw new Error('not used by this spec');
  }

  findByTransactionId(): never {
    throw new Error('not used by this spec');
  }

  insert(): never {
    throw new Error('not used by this spec');
  }

  recordGatewayResponse(): never {
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

  reserve(): never {
    throw new Error('not used by this spec');
  }

  commit(): never {
    throw new Error('not used by this spec');
  }
}

class FakeUnitOfWork implements UnitOfWork {
  readonly tx: TxContext = { __brand: 'TxContext' };

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    return work(this.tx);
  }
}

function buildUseCase(
  ports: RecordingPorts,
  unitOfWork: FakeUnitOfWork,
): FinalizeTransactionUseCase {
  return new FinalizeTransactionUseCase({
    transactionRepository: ports,
    stockReservation: ports,
    deliveryRepository: ports,
    unitOfWork,
  });
}

describe('FinalizeTransactionUseCase', () => {
  it('finalizes, releases stock and cancels the delivery in one unit of work for ERROR', async () => {
    const ports = new RecordingPorts();
    const unitOfWork = new FakeUnitOfWork();
    const useCase = buildUseCase(ports, unitOfWork);

    const result = await useCase.execute({
      id: TRANSACTION_ID,
      status: 'ERROR',
      statusMessage: 'Invalid token',
    });

    expect(result._unsafeUnwrap()).toBe('FINALIZED');
    expect(ports.calls.map((call) => call.name)).toEqual(['finalize', 'release', 'transition']);
    expect(ports.calls.every((call) => call.tx === unitOfWork.tx)).toBe(true);
    expect(ports.calls[0]?.args).toEqual({
      id: TRANSACTION_ID,
      status: 'ERROR',
      statusMessage: 'Invalid token',
    });
    expect(ports.calls[1]?.args).toEqual(STOCK_LINE);
    expect(ports.calls[2]?.args).toEqual({ transactionId: TRANSACTION_ID, to: 'CANCELLED' });
  });

  it.each(['DECLINED', 'VOIDED', 'EXPIRED'] as const)(
    'takes the same release branch for %s',
    async (status) => {
      const ports = new RecordingPorts();
      const useCase = buildUseCase(ports, new FakeUnitOfWork());

      const result = await useCase.execute({ id: TRANSACTION_ID, status, statusMessage: null });

      expect(result._unsafeUnwrap()).toBe('FINALIZED');
      expect(ports.calls.map((call) => call.name)).toEqual(['finalize', 'release', 'transition']);
    },
  );

  it('returns ALREADY_FINAL without releasing stock or transitioning the delivery when already final', async () => {
    const ports = new RecordingPorts();
    ports.queueFinalizeReturn(null);
    const useCase = buildUseCase(ports, new FakeUnitOfWork());

    const result = await useCase.execute({
      id: TRANSACTION_ID,
      status: 'ERROR',
      statusMessage: 'Invalid token',
    });

    expect(result._unsafeUnwrap()).toBe('ALREADY_FINAL');
    expect(ports.calls.map((call) => call.name)).toEqual(['finalize']);
  });

  it('throws synchronously for APPROVED without calling any port', () => {
    const ports = new RecordingPorts();
    const useCase = buildUseCase(ports, new FakeUnitOfWork());

    expect(() =>
      useCase.execute({ id: TRANSACTION_ID, status: 'APPROVED', statusMessage: null }),
    ).toThrow('APPROVED finalization lands in api 04.2');
    expect(ports.calls).toEqual([]);
  });
});
