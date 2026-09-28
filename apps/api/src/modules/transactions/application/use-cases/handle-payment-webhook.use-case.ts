import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionStatus } from '@checkout/shared/enums';

import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import { PAYMENT_EVENT_TRANSACTION_UPDATED } from '../../domain/webhook-event.constants';
import type { TransactionRepository } from '../ports/transaction.repository.port';
import { FinalizeTransactionUseCase } from './finalize-transaction.use-case';

export interface PaymentWebhookEvent {
  readonly type: string;
  readonly providerTransactionId: string;
  readonly status: TransactionStatus;
  readonly statusMessage: string | null;
}

export type HandlePaymentWebhookResult =
  | 'FINALIZED'
  | 'ALREADY_FINAL'
  | 'IGNORED'
  | 'UNKNOWN_TRANSACTION';

// Bundles the use case's 2 collaborators behind one DI token (references/coding-conventions.md#c1,
// same pattern as FinalizeTransactionUseCase's FINALIZE_TRANSACTION_DEPENDENCIES).
export const HANDLE_PAYMENT_WEBHOOK_DEPENDENCIES = Symbol('HANDLE_PAYMENT_WEBHOOK_DEPENDENCIES');

export interface HandlePaymentWebhookDependencies {
  readonly transactionRepository: TransactionRepository;
  readonly finalizeTransactionUseCase: FinalizeTransactionUseCase;
}

@Injectable()
export class HandlePaymentWebhookUseCase {
  private readonly logger = new Logger(HandlePaymentWebhookUseCase.name);

  constructor(
    @Inject(HANDLE_PAYMENT_WEBHOOK_DEPENDENCIES)
    private readonly deps: HandlePaymentWebhookDependencies,
  ) {}

  // The checksum already proved this event is genuine and unmodified, and
  // the controller already mapped the raw provider status through the
  // anti-corruption layer, so the signed status is trusted outright here —
  // no gateway call, per references/layering.md's "no network call while
  // row locks are held" and this spec's own decision to avoid a ~25 s round
  // trip during an outage.
  execute(event: PaymentWebhookEvent): ResultAsync<HandlePaymentWebhookResult, never> {
    if (event.type !== PAYMENT_EVENT_TRANSACTION_UPDATED) {
      return okAsync('IGNORED');
    }

    const { transactionRepository, finalizeTransactionUseCase } = this.deps;

    return transactionRepository
      .findByProviderTransactionId(event.providerTransactionId)
      .andThen((transaction) => {
        if (!transaction) {
          this.logger.warn(
            `webhook: unknown provider transaction id ${event.providerTransactionId}`,
          );
          return okAsync<HandlePaymentWebhookResult, never>('UNKNOWN_TRANSACTION');
        }

        if (event.status === TransactionStatus.PENDING) {
          return okAsync<HandlePaymentWebhookResult, never>('IGNORED');
        }

        return finalizeTransactionUseCase.execute({
          id: transaction.id,
          status: event.status,
          statusMessage: event.statusMessage,
        });
      });
  }
}
