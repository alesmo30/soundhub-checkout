import { Inject, Injectable } from '@nestjs/common';

import type { DeliveryRepository } from '../../../deliveries';
import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { FinalStatus } from '../../domain/transaction';
import type { StockReservationPort } from '../ports/stock-reservation.port';
import type { TransactionRepository } from '../ports/transaction.repository.port';

export interface FinalizeTransactionOutcome {
  readonly id: string;
  readonly status: FinalStatus;
  readonly statusMessage: string | null;
}

export type FinalizeTransactionResult = 'FINALIZED' | 'ALREADY_FINAL';

// Bundles the use case's 4 collaborators behind one DI token so its
// constructor stays at 1 positional parameter (see
// references/coding-conventions.md#c1 — bundle beyond 3 into a named
// interface, same pattern as pricing's GetQuoteDependencies).
// transactions.module.ts (step 12) builds this object from the individually
// wired TRANSACTION_REPOSITORY, STOCK_RESERVATION, DELIVERY_REPOSITORY and
// UNIT_OF_WORK providers.
export const FINALIZE_TRANSACTION_DEPENDENCIES = Symbol('FINALIZE_TRANSACTION_DEPENDENCIES');

export interface FinalizeTransactionDependencies {
  readonly transactionRepository: TransactionRepository;
  readonly stockReservation: StockReservationPort;
  readonly deliveryRepository: DeliveryRepository;
  readonly unitOfWork: UnitOfWork;
}

@Injectable()
export class FinalizeTransactionUseCase {
  constructor(
    @Inject(FINALIZE_TRANSACTION_DEPENDENCIES)
    private readonly deps: FinalizeTransactionDependencies,
  ) {}

  execute(outcome: FinalizeTransactionOutcome): ResultAsync<FinalizeTransactionResult, never> {
    // APPROVED is unreachable from this spec: createCharge (api 04.1) never
    // returns an immediate APPROVED, and the real branch lands in api 04.2.
    // Crashing here beats silently releasing stock for an approved charge.
    if (outcome.status === 'APPROVED') {
      throw new Error('APPROVED finalization lands in api 04.2');
    }

    const { transactionRepository, stockReservation, deliveryRepository, unitOfWork } = this.deps;

    return unitOfWork.run((tx) =>
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

          return stockReservation
            .release(tx, line)
            .andThen(() =>
              deliveryRepository.transition(tx, {
                transactionId: outcome.id,
                to: 'CANCELLED',
              }),
            )
            .map((): FinalizeTransactionResult => 'FINALIZED');
        }),
    );
  }
}
