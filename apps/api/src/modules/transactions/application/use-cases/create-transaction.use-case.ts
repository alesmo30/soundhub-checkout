import { Inject, Injectable } from '@nestjs/common';
import { CURRENCY } from '@checkout/shared/constants';
import type {
  Cents,
  Currency,
  DeliveryInput,
  PaymentInput,
  Quote,
  TransactionCreated,
} from '@checkout/shared/contracts';
import { DeliveryStatus, TransactionStatus } from '@checkout/shared/enums';

import type { Customer } from '../../../customers';
import type { Delivery } from '../../../deliveries';
import type { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Transaction } from '../../domain/transaction';
import {
  customerNotFoundForPayment,
  idempotencyKeyReused,
  paymentGatewayUnavailable,
  priceChanged,
} from '../../domain/transaction.errors';
import { CREATE_TRANSACTION_DEPENDENCIES } from '../ports/create-transaction.dependencies';
import type { CreateTransactionDependencies } from '../ports/create-transaction.dependencies';

export interface CreateTransactionCommand {
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly customerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly installments: number;
  readonly expectedTotalInCents: Cents;
  readonly payment: PaymentInput;
  readonly delivery: DeliveryInput;
}

export interface CreateTransactionOutcome {
  readonly view: TransactionCreated;
  readonly replayed: boolean;
}

// Threaded from quoteAndVerify through reserve and charge: both later
// phases need the verified customer and quote. Step 11 extends this with
// the reservation's transaction/delivery rows once reserve stops stubbing.
interface VerifiedContext {
  readonly customer: Customer;
  readonly quote: Quote;
}

@Injectable()
export class CreateTransactionUseCase {
  constructor(
    @Inject(CREATE_TRANSACTION_DEPENDENCIES)
    private readonly deps: CreateTransactionDependencies,
  ) {}

  execute(cmd: CreateTransactionCommand): ResultAsync<CreateTransactionOutcome, DomainError> {
    return this.checkIdempotency(cmd).andThen((replay) =>
      replay
        ? okAsync<CreateTransactionOutcome, DomainError>(replay)
        : this.guard()
            .andThen(() => this.quoteAndVerify(cmd))
            .andThen((context) => this.reserve(context))
            .andThen((context) => this.charge(context)),
    );
  }

  private checkIdempotency(
    cmd: CreateTransactionCommand,
  ): ResultAsync<CreateTransactionOutcome | null, DomainError> {
    const { transactionRepository, deliveryRepository } = this.deps;

    return transactionRepository.findByIdempotencyKey(cmd.idempotencyKey).andThen((existing) => {
      if (!existing) {
        return okAsync<CreateTransactionOutcome | null, DomainError>(null);
      }

      if (existing.requestHash !== cmd.requestHash) {
        return errAsync<CreateTransactionOutcome | null, DomainError>(idempotencyKeyReused());
      }

      return deliveryRepository
        .findByTransactionId(existing.id)
        .map((delivery): CreateTransactionOutcome => ({
          view: this.toReplayedView(existing, delivery),
          replayed: true,
        }));
    });
  }

  private guard(): ResultAsync<void, DomainError> {
    const availability = this.deps.paymentGateway.ensureAvailable();
    return availability.isOk() ? okAsync(undefined) : errAsync(paymentGatewayUnavailable());
  }

  private quoteAndVerify(cmd: CreateTransactionCommand): ResultAsync<VerifiedContext, DomainError> {
    const { customerRepository, getQuoteUseCase } = this.deps;

    return customerRepository.findById(cmd.customerId).andThen((customer) => {
      if (!customer) {
        return errAsync<VerifiedContext, DomainError>(customerNotFoundForPayment());
      }

      return getQuoteUseCase
        .execute({
          productId: cmd.productId,
          quantity: cmd.quantity,
          municipalityCode: cmd.delivery.municipalityCode,
        })
        .andThen((quote) => {
          if (quote.totalInCents !== cmd.expectedTotalInCents) {
            return errAsync<VerifiedContext, DomainError>(
              priceChanged(cmd.expectedTotalInCents, quote.totalInCents),
            );
          }

          return okAsync<VerifiedContext, DomainError>({ customer, quote });
        });
    });
  }

  // TODO(step 11): reserve stock and insert the transaction + delivery in
  // one UnitOfWork; regenerate the reference on a collision and re-read and
  // replay on an idempotency-key race.
  private reserve(context: VerifiedContext): ResultAsync<VerifiedContext, DomainError> {
    return okAsync(context);
  }

  // TODO(step 11): call the gateway after the reservation commits and
  // record its outcome (PENDING with a provider id, or ERROR through the
  // finalizer). This placeholder view is not exercised by this step's own
  // required coverage — every bullet below returns before reaching here.
  private charge(context: VerifiedContext): ResultAsync<CreateTransactionOutcome, DomainError> {
    return okAsync({
      view: {
        id: '',
        reference: '',
        status: TransactionStatus.PENDING,
        statusMessage: null,
        totalInCents: context.quote.totalInCents,
        currency: context.quote.currency,
        delivery: { id: '', status: DeliveryStatus.AWAITING_PAYMENT },
        createdAt: new Date().toISOString(),
      },
      replayed: false,
    });
  }

  private toReplayedView(transaction: Transaction, delivery: Delivery | null): TransactionCreated {
    if (!delivery) {
      // A transaction always gets its delivery in the same reservation
      // phase; a missing one here means the data is corrupt, not a caller
      // mistake, so this crashes instead of returning a wrong view.
      throw new Error(`Transaction ${transaction.id} has no delivery`);
    }

    return {
      id: transaction.id,
      reference: transaction.reference,
      status: transaction.status,
      statusMessage: transaction.providerStatusMessage,
      totalInCents: transaction.totalInCents,
      currency: this.toCurrency(transaction.currency),
      delivery: { id: delivery.id, status: delivery.status },
      createdAt: transaction.createdAt.toISOString(),
    };
  }

  // Transaction.currency is a loose `string` at the domain layer (it comes
  // straight off an ORM column), but the schema only ever stores COP; this
  // narrows without an `as` cast (see references/coding-conventions.md#c5).
  private toCurrency(value: string): Currency {
    if (value !== CURRENCY) {
      throw new Error(`Unexpected currency ${value}`);
    }
    return value;
  }
}
