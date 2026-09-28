import { Inject, Injectable, Logger } from '@nestjs/common';

import type { DeliveryRepository } from '../../../deliveries';
import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { EventPublisher } from '../../../../shared/application/ports/event-publisher.port';
import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { FinalStatus } from '../../domain/transaction';
import type { TransactionFinalizedEvent } from '../../domain/transaction-finalized.event';
import type { StockReservationPort } from '../ports/stock-reservation.port';
import type { TransactionRepository } from '../ports/transaction.repository.port';

export interface FinalizeTransactionOutcome {
  readonly id: string;
  readonly status: FinalStatus;
  readonly statusMessage: string | null;
}

export type FinalizeTransactionResult = 'FINALIZED' | 'ALREADY_FINAL';

// Bundles the use case's 6 collaborators behind one DI token so its
// constructor stays at 1 positional parameter (see
// references/coding-conventions.md#c1 — bundle beyond 3 into a named
// interface, same pattern as pricing's GetQuoteDependencies).
// transactions.module.ts builds this object from the individually wired
// TRANSACTION_REPOSITORY, STOCK_RESERVATION, DELIVERY_REPOSITORY,
// UNIT_OF_WORK, CLOCK and EVENT_PUBLISHER providers.
export const FINALIZE_TRANSACTION_DEPENDENCIES = Symbol('FINALIZE_TRANSACTION_DEPENDENCIES');

export interface FinalizeTransactionDependencies {
  readonly transactionRepository: TransactionRepository;
  readonly stockReservation: StockReservationPort;
  readonly deliveryRepository: DeliveryRepository;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly eventPublisher: EventPublisher;
}

@Injectable()
export class FinalizeTransactionUseCase {
  private readonly logger = new Logger(FinalizeTransactionUseCase.name);

  constructor(
    @Inject(FINALIZE_TRANSACTION_DEPENDENCIES)
    private readonly deps: FinalizeTransactionDependencies,
  ) {}

  execute(outcome: FinalizeTransactionOutcome): ResultAsync<FinalizeTransactionResult, never> {
    const { transactionRepository, stockReservation, deliveryRepository, unitOfWork } = this.deps;

    return unitOfWork
      .run((tx) =>
        transactionRepository
          .finalize(tx, {
            id: outcome.id,
            status: outcome.status,
            statusMessage: outcome.statusMessage,
          })
          .andThen((line) => {
            if (line === null) {
              // Zero rows affected: another caller already finalized this
              // transaction (webhook, polling and reconciler all converge here).
              return okAsync<FinalizeTransactionResult, never>('ALREADY_FINAL');
            }

            const settleStockAndDelivery =
              outcome.status === 'APPROVED'
                ? stockReservation
                    .commit(tx, line)
                    .andThen(() =>
                      deliveryRepository.transition(tx, {
                        transactionId: outcome.id,
                        to: 'READY_TO_SHIP',
                      }),
                    )
                : stockReservation
                    .release(tx, line)
                    .andThen(() =>
                      deliveryRepository.transition(tx, {
                        transactionId: outcome.id,
                        to: 'CANCELLED',
                      }),
                    );

            return settleStockAndDelivery.map((): FinalizeTransactionResult => 'FINALIZED');
          }),
      )
      .andThen((result) => this.publishIfFinalized(result, outcome));
  }

  // Runs only after unitOfWork.run has committed (references/layering.md —
  // no network call while row locks are held) and only when this call won
  // the finalization race. A publish failure is logged and swallowed: the
  // stock and status are already committed, so failing here would make the
  // client see an error for a payment that already succeeded.
  private publishIfFinalized(
    result: FinalizeTransactionResult,
    outcome: FinalizeTransactionOutcome,
  ): ResultAsync<FinalizeTransactionResult, never> {
    if (result === 'ALREADY_FINAL') {
      return okAsync(result);
    }

    const { clock, eventPublisher } = this.deps;
    const event: TransactionFinalizedEvent = {
      type: 'transaction.finalized',
      transactionId: outcome.id,
      status: outcome.status,
      occurredAt: clock.now(),
    };

    return eventPublisher
      .publish(event)
      .orElse((error) => {
        this.logger.warn(`event publish failed for transaction ${outcome.id}: ${error.message}`);
        return okAsync<void, never>(undefined);
      })
      .map(() => result);
  }
}
