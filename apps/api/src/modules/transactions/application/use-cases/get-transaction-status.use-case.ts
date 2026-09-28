import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TransactionView } from '@checkout/shared/contracts';

import type { ProductRepository } from '../../../catalog';
import type { DeliveryRepository } from '../../../deliveries';
import type { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Transaction } from '../../domain/transaction';
import { transactionNotFound } from '../../domain/transaction.errors';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import type { TransactionRepository } from '../ports/transaction.repository.port';
import { FinalizeTransactionUseCase } from './finalize-transaction.use-case';
import { toTransactionView } from './helpers/to-transaction-view';

// Bundles the use case's 5 collaborators behind one DI token so its
// constructor stays at 1 positional parameter (references/coding-conventions.md#c1,
// same pattern as FinalizeTransactionUseCase's FINALIZE_TRANSACTION_DEPENDENCIES).
export const GET_TRANSACTION_STATUS_DEPENDENCIES = Symbol('GET_TRANSACTION_STATUS_DEPENDENCIES');

export interface GetTransactionStatusDependencies {
  readonly transactionRepository: TransactionRepository;
  readonly paymentGateway: PaymentGatewayPort;
  readonly finalizeTransactionUseCase: FinalizeTransactionUseCase;
  readonly productRepository: ProductRepository;
  readonly deliveryRepository: DeliveryRepository;
}

@Injectable()
export class GetTransactionStatusUseCase {
  private readonly logger = new Logger(GetTransactionStatusUseCase.name);

  constructor(
    @Inject(GET_TRANSACTION_STATUS_DEPENDENCIES)
    private readonly deps: GetTransactionStatusDependencies,
  ) {}

  execute(id: string): ResultAsync<TransactionView, DomainError> {
    return this.load(id)
      .andThen((transaction) => this.sync(transaction))
      .andThen((transaction) => this.present(transaction));
  }

  private load(id: string): ResultAsync<Transaction, DomainError> {
    return this.deps.transactionRepository.findById(id).andThen((transaction) => {
      if (!transaction) {
        return errAsync<Transaction, DomainError>(transactionNotFound(id));
      }

      return okAsync<Transaction, DomainError>(transaction);
    });
  }

  // Runs only for a PENDING transaction with a provider id (see
  // docs/specs/10 sync decision table). The gateway is called before any
  // UnitOfWork opens (references/layering.md — no network call while row
  // locks are held); FinalizeTransactionUseCase opens its own.
  private sync(transaction: Transaction): ResultAsync<Transaction, DomainError> {
    const { providerTransactionId } = transaction;

    if (transaction.status !== 'PENDING' || !providerTransactionId) {
      return okAsync<Transaction, DomainError>(transaction);
    }

    return this.deps.paymentGateway
      .getCharge(providerTransactionId)
      .andThen((charge) => {
        if (charge.status === 'PENDING') {
          return okAsync<Transaction, DomainError>(transaction);
        }

        return this.deps.finalizeTransactionUseCase
          .execute({
            id: transaction.id,
            status: charge.status,
            statusMessage: charge.statusMessage,
          })
          .andThen(() => this.rereadAfterFinalize(transaction.id));
      })
      .orElse((error) => {
        // The stored PENDING is still the last thing we know; the next
        // poll or the reconciler resolves it (references/layering.md — a
        // sync failure never turns into an error response).
        this.logger.warn(
          `gateway sync failed for transaction ${transaction.id}: kind=${error.kind}`,
        );
        return okAsync<Transaction, DomainError>(transaction);
      });
  }

  // Another caller (webhook or reconciler) may have finalized this
  // transaction first, possibly with a different status than the one this
  // sync just fetched; re-reading shows whichever status actually won.
  private rereadAfterFinalize(id: string): ResultAsync<Transaction, DomainError> {
    return this.deps.transactionRepository.findById(id).andThen((reread) => {
      if (!reread) {
        // A transaction that existed a moment ago cannot disappear; the
        // global exception filter turns this into a 500 INTERNAL_ERROR
        // (same "throw on an unreachable state" pattern as
        // create-transaction.use-case.ts and get-quote.use-case.ts).
        throw new Error(`GetTransactionStatusUseCase: transaction ${id} vanished after finalize`);
      }

      return okAsync<Transaction, DomainError>(reread);
    });
  }

  private present(transaction: Transaction): ResultAsync<TransactionView, DomainError> {
    const { productRepository, deliveryRepository } = this.deps;

    return ResultAsync.combine([
      productRepository.findById(transaction.productId),
      deliveryRepository.findByTransactionId(transaction.id),
    ]).andThen(([product, delivery]) => {
      if (!product || !delivery) {
        // A missing product or delivery is a data inconsistency: nothing
        // in this codebase soft-deletes them today (references/layering.md
        // — the domain-service test), so this can only follow a manual DB
        // change, which must be loud.
        const missing = !product ? 'product' : 'delivery';
        this.logger.error(`transaction ${transaction.id} references a missing ${missing}`);
        throw new Error(
          `GetTransactionStatusUseCase: missing ${missing} for transaction ${transaction.id}`,
        );
      }

      return okAsync<TransactionView, DomainError>(
        toTransactionView({ transaction, product, delivery }),
      );
    });
  }
}
