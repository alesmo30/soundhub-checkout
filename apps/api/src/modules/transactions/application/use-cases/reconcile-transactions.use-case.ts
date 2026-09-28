import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionStatus } from '@checkout/shared/enums';

import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { EventPublisher } from '../../../../shared/application/ports/event-publisher.port';
import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { ResultAsync } from '../../../../shared/domain/result';
import {
  RECONCILER_BATCH_SIZE,
  RECONCILER_LEASE_MS,
  RECONCILER_TIME_BUDGET_MS,
} from '../../domain/reconciler.constants';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import type { TransactionRepository } from '../ports/transaction.repository.port';
import { FinalizeTransactionUseCase } from './finalize-transaction.use-case';

export interface ReconcileSummary {
  readonly synced: number;
  readonly expired: number;
  readonly recovered: number;
  readonly republished: number;
  readonly deferred: number;
  readonly failed: number;
}

function emptySummary(): ReconcileSummary {
  return { synced: 0, expired: 0, recovered: 0, republished: 0, deferred: 0, failed: 0 };
}

// Bundles the use case's 6 collaborators behind one DI token
// (references/coding-conventions.md#c1, same pattern as
// FinalizeTransactionUseCase's FINALIZE_TRANSACTION_DEPENDENCIES).
export const RECONCILE_TRANSACTIONS_DEPENDENCIES = Symbol('RECONCILE_TRANSACTIONS_DEPENDENCIES');

export interface ReconcileTransactionsDependencies {
  readonly transactionRepository: TransactionRepository;
  readonly paymentGateway: PaymentGatewayPort;
  readonly finalizeTransactionUseCase: FinalizeTransactionUseCase;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly eventPublisher: EventPublisher;
}

@Injectable()
export class ReconcileTransactionsUseCase {
  private readonly logger = new Logger(ReconcileTransactionsUseCase.name);

  constructor(
    @Inject(RECONCILE_TRANSACTIONS_DEPENDENCIES)
    private readonly deps: ReconcileTransactionsDependencies,
  ) {}

  // Three named phases in strict order, each keeping its own decisions
  // (references/coding-conventions.md#c3's multi-phase-orchestrator
  // exception). (a) and (b) share one time budget; (c) has its own leased
  // claim and is never deferred by it.
  execute(): ResultAsync<ReconcileSummary, never> {
    return ResultAsync.fromSafePromise(this.run());
  }

  private async run(): Promise<ReconcileSummary> {
    const deadline = this.deps.clock.now().getTime() + RECONCILER_TIME_BUDGET_MS;
    let summary = emptySummary();

    summary = await this.syncPending(deadline, summary);
    summary = await this.expireReservations(deadline, summary);
    summary = await this.republishUnsentEmails(summary);

    this.logger.log(summary);
    return summary;
  }

  private budgetSpent(deadline: number): boolean {
    return this.deps.clock.now().getTime() >= deadline;
  }

  // (a) Sync: claims PENDING transactions with a known provider id, older
  // than the lease, and asks the gateway for each one's real status. The
  // claim commits immediately (its own unit of work); getCharge and
  // finalize run after it, never inside it
  // (references/layering.md — no network call while row locks are held).
  private async syncPending(
    deadline: number,
    summary: ReconcileSummary,
  ): Promise<ReconcileSummary> {
    const { transactionRepository, paymentGateway, finalizeTransactionUseCase, unitOfWork, clock } =
      this.deps;

    const olderThan = new Date(clock.now().getTime() - RECONCILER_LEASE_MS);
    const claimed = (
      await unitOfWork.run((tx) =>
        transactionRepository.claimPendingForSync(tx, { olderThan, limit: RECONCILER_BATCH_SIZE }),
      )
    )._unsafeUnwrap();

    let { synced, failed, deferred } = summary;

    for (let index = 0; index < claimed.length; index += 1) {
      if (this.budgetSpent(deadline)) {
        deferred += claimed.length - index;
        break;
      }

      const transaction = claimed[index];
      if (!transaction) continue;
      const providerTransactionId = transaction.providerTransactionId;
      // Claimed only when non-null (claimPendingForSync's own filter), but
      // TypeScript still sees the nullable domain field here.
      if (!providerTransactionId) {
        throw new Error(`syncPending: claimed transaction ${transaction.id} has no provider id`);
      }

      const chargeResult = await paymentGateway.getCharge(providerTransactionId);

      if (chargeResult.isErr()) {
        failed += 1;
        continue;
      }

      const charge = chargeResult.value;
      if (charge.status === TransactionStatus.PENDING) {
        continue;
      }

      await finalizeTransactionUseCase.execute({
        id: transaction.id,
        status: charge.status,
        statusMessage: charge.statusMessage,
      });
      synced += 1;
    }

    return { ...summary, synced, failed, deferred };
  }

  // (b) Safe expiry: filled in by the next step.
  private async expireReservations(
    _deadline: number,
    summary: ReconcileSummary,
  ): Promise<ReconcileSummary> {
    return summary;
  }

  // (c) Re-publish: filled in by the next step.
  private async republishUnsentEmails(summary: ReconcileSummary): Promise<ReconcileSummary> {
    return summary;
  }
}
