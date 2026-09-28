import { Logger } from '@nestjs/common';

import type { EventPublishError, EventPublisher } from '../../../../shared/application/ports/event-publisher.port';
import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { DeliveryRepository } from '../../../deliveries';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import type { DomainEvent } from '../../../../shared/domain/domain-event';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { StockLine, StockReservationPort } from '../ports/stock-reservation.port';
import type { TransactionRepository } from '../ports/transaction.repository.port';
import { FinalizeTransactionUseCase } from './finalize-transaction.use-case';

const TRANSACTION_ID = 'transaction-1';
const STOCK_LINE: StockLine = { productId: 'product-1', quantity: 2 };
const OCCURRED_AT = new Date('2026-09-27T12:00:00.000Z');

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

  commit(tx: TxContext, line: StockLine): ResultAsync<void, never> {
    this.calls.push({ name: 'commit', tx, args: line });
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
}

class FakeUnitOfWork implements UnitOfWork {
  readonly tx: TxContext = { __brand: 'TxContext' };

  constructor(private readonly callOrder: string[] = []) {}

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    this.callOrder.push('run:start');
    return work(this.tx).map((value: T) => {
      this.callOrder.push('run:end');
      return value;
    });
  }
}

class FakeClock implements Clock {
  now(): Date {
    return OCCURRED_AT;
  }
}

// Records publish calls (and their relative order against the recorded
// port calls above, via the shared `callOrder` array) so the specs can
// prove publish only happens after unitOfWork.run has resolved.
class RecordingEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];
  private result: ResultAsync<void, EventPublishError> = okAsync(undefined);

  constructor(private readonly callOrder: string[]) {}

  queueError(error: EventPublishError): void {
    this.result = errAsync(error);
  }

  publish(event: DomainEvent): ResultAsync<void, EventPublishError> {
    this.callOrder.push('publish');
    this.events.push(event);
    return this.result;
  }
}

function buildUseCase(
  ports: RecordingPorts,
  unitOfWork: FakeUnitOfWork,
  eventPublisher: RecordingEventPublisher,
): FinalizeTransactionUseCase {
  return new FinalizeTransactionUseCase({
    transactionRepository: ports,
    stockReservation: ports,
    deliveryRepository: ports,
    unitOfWork,
    clock: new FakeClock(),
    eventPublisher,
  });
}

describe('FinalizeTransactionUseCase', () => {
  it('commits stock and ships the delivery for APPROVED, then publishes once after the commit', async () => {
    const ports = new RecordingPorts();
    const callOrder: string[] = [];
    const eventPublisher = new RecordingEventPublisher(callOrder);
    const unitOfWork = new FakeUnitOfWork(callOrder);
    const useCase = buildUseCase(ports, unitOfWork, eventPublisher);

    const result = await useCase.execute({
      id: TRANSACTION_ID,
      status: 'APPROVED',
      statusMessage: null,
    });

    expect(result._unsafeUnwrap()).toBe('FINALIZED');
    expect(ports.calls.map((call) => call.name)).toEqual(['finalize', 'commit', 'transition']);
    expect(ports.calls[1]?.args).toEqual(STOCK_LINE);
    expect(ports.calls[2]?.args).toEqual({ transactionId: TRANSACTION_ID, to: 'READY_TO_SHIP' });
    expect(eventPublisher.events).toEqual([
      {
        type: 'transaction.finalized',
        transactionId: TRANSACTION_ID,
        status: 'APPROVED',
        occurredAt: OCCURRED_AT,
      },
    ]);
    // publish happens strictly after unitOfWork.run has resolved: never
    // while the transaction's row locks are still held.
    expect(callOrder).toEqual(['run:start', 'run:end', 'publish']);
  });

  it.each(['DECLINED', 'VOIDED', 'ERROR', 'EXPIRED'] as const)(
    'releases stock, cancels the delivery and publishes once for %s',
    async (status) => {
      const ports = new RecordingPorts();
      const eventPublisher = new RecordingEventPublisher([]);
      const useCase = buildUseCase(ports, new FakeUnitOfWork(), eventPublisher);

      const result = await useCase.execute({ id: TRANSACTION_ID, status, statusMessage: null });

      expect(result._unsafeUnwrap()).toBe('FINALIZED');
      expect(ports.calls.map((call) => call.name)).toEqual(['finalize', 'release', 'transition']);
      expect(ports.calls[1]?.args).toEqual(STOCK_LINE);
      expect(ports.calls[2]?.args).toEqual({ transactionId: TRANSACTION_ID, to: 'CANCELLED' });
      expect(eventPublisher.events).toEqual([
        {
          type: 'transaction.finalized',
          transactionId: TRANSACTION_ID,
          status,
          occurredAt: OCCURRED_AT,
        },
      ]);
    },
  );

  it('returns ALREADY_FINAL without releasing stock, transitioning the delivery or publishing', async () => {
    const ports = new RecordingPorts();
    ports.queueFinalizeReturn(null);
    const eventPublisher = new RecordingEventPublisher([]);
    const useCase = buildUseCase(ports, new FakeUnitOfWork(), eventPublisher);

    const result = await useCase.execute({
      id: TRANSACTION_ID,
      status: 'ERROR',
      statusMessage: 'Invalid token',
    });

    expect(result._unsafeUnwrap()).toBe('ALREADY_FINAL');
    expect(ports.calls.map((call) => call.name)).toEqual(['finalize']);
    expect(eventPublisher.events).toEqual([]);
  });

  it('logs a warning and still returns FINALIZED when the publish fails', async () => {
    const ports = new RecordingPorts();
    const eventPublisher = new RecordingEventPublisher([]);
    eventPublisher.queueError({ message: 'queue unavailable' });
    const useCase = buildUseCase(ports, new FakeUnitOfWork(), eventPublisher);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const result = await useCase.execute({
      id: TRANSACTION_ID,
      status: 'APPROVED',
      statusMessage: null,
    });

    expect(result._unsafeUnwrap()).toBe('FINALIZED');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
