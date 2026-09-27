import { Inject, Injectable } from '@nestjs/common';
import { RESERVATION_TTL_MS } from '@checkout/shared/constants';
import type {
  Cents,
  DeliveryInput,
  PaymentInput,
  Quote,
  TransactionCreated,
} from '@checkout/shared/contracts';
import { DeliveryStatus, TransactionStatus } from '@checkout/shared/enums';

import type { Customer } from '../../../customers';
import type { Delivery } from '../../../deliveries';
import { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { NewDelivery } from '../../../deliveries';
import type { NewTransaction, Transaction } from '../../domain/transaction';
import { generateReference } from '../../domain/transaction-reference';
import { REFERENCE_MAX_ATTEMPTS } from '../../domain/transactions.constants';
import {
  customerNotFoundForPayment,
  idempotencyKeyReused,
  outOfStockOnReserve,
  paymentGatewayUnavailable,
  priceChanged,
} from '../../domain/transaction.errors';
import type { PaymentGatewayError } from '../ports/payment-gateway.port';
import type { StockLine } from '../ports/stock-reservation.port';
import type { TransactionUniqueViolation } from '../ports/transaction.repository.port';
import { CREATE_TRANSACTION_DEPENDENCIES } from '../ports/create-transaction.dependencies';
import type { CreateTransactionDependencies } from '../ports/create-transaction.dependencies';
import { toTransactionCreated } from './helpers/to-transaction-created';

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
// phases need the verified customer and quote.
interface VerifiedContext {
  readonly customer: Customer;
  readonly quote: Quote;
}

// The rows reserve() just inserted, needed by charge() to call the gateway
// and to render the final TransactionCreated view.
interface ReservedRow {
  readonly transaction: Transaction;
  readonly delivery: Delivery;
}

interface ReservedContext extends VerifiedContext, ReservedRow {
  readonly kind: 'RESERVED';
}

// reserve() either produces a freshly reserved row (charge() runs next), or
// resolves the whole use case on a same-key race with an already-committed
// row (charge() never runs — no gateway call for a replay).
type ReserveOutcome =
  ReservedContext | { readonly kind: 'REPLAYED'; readonly outcome: CreateTransactionOutcome };

interface RecoverFromReserveErrorParams {
  readonly cmd: CreateTransactionCommand;
  readonly context: VerifiedContext;
  readonly attempt: number;
  readonly error: DomainError | TransactionUniqueViolation;
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
            .andThen((context) => this.reserve(cmd, context))
            .andThen((reserveOutcome) =>
              reserveOutcome.kind === 'REPLAYED'
                ? okAsync<CreateTransactionOutcome, DomainError>(reserveOutcome.outcome)
                : this.charge(cmd, reserveOutcome),
            ),
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
          view: toTransactionCreated(existing, this.requireDelivery(existing, delivery)),
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

  // Runs the raw-SQL reserve, the transaction insert and the delivery
  // insert in one UnitOfWork (references/data-integrity.md#stock). A
  // reference collision aborts the Postgres transaction, so the whole
  // attempt — reserve included — is retried from scratch with a new
  // reference, up to REFERENCE_MAX_ATTEMPTS. A key collision means a
  // concurrent request already won the race: roll back and replay it.
  private reserve(
    cmd: CreateTransactionCommand,
    context: VerifiedContext,
  ): ResultAsync<ReserveOutcome, DomainError> {
    return this.attemptReserve(cmd, context, 1);
  }

  private attemptReserve(
    cmd: CreateTransactionCommand,
    context: VerifiedContext,
    attempt: number,
  ): ResultAsync<ReserveOutcome, DomainError> {
    const {
      stockReservation,
      transactionRepository,
      deliveryRepository,
      unitOfWork,
      clock,
      random,
    } = this.deps;
    const line: StockLine = { productId: cmd.productId, quantity: cmd.quantity };

    return unitOfWork
      .run((tx) =>
        stockReservation.reserve(tx, line).andThen((outcome) => {
          if (outcome === 'INSUFFICIENT_STOCK') {
            return errAsync<ReservedRow, DomainError | TransactionUniqueViolation>(
              outOfStockOnReserve(),
            );
          }

          const reference = generateReference(clock.now(), random);
          const values = this.buildNewTransaction(cmd, context, reference);

          return transactionRepository
            .insert(tx, values)
            .andThen((transaction) =>
              deliveryRepository
                .insert(tx, this.buildNewDelivery(cmd, context, transaction.id))
                .map((delivery): ReservedRow => ({ transaction, delivery })),
            );
        }),
      )
      .map((row): ReserveOutcome => ({ kind: 'RESERVED', ...context, ...row }))
      .orElse((error) => this.recoverFromReserveError({ cmd, context, attempt, error }));
  }

  private recoverFromReserveError(
    params: RecoverFromReserveErrorParams,
  ): ResultAsync<ReserveOutcome, DomainError> {
    const { cmd, context, attempt, error } = params;

    if (error instanceof DomainError) {
      return errAsync(error);
    }

    if (error.constraint === 'IDEMPOTENCY_KEY') {
      return this.replayAfterKeyCollision(cmd);
    }

    if (attempt >= REFERENCE_MAX_ATTEMPTS) {
      // Astronomically rare (REFERENCE_MAX_ATTEMPTS consecutive 6-char
      // collisions on the same day). No ErrorCode fits this without
      // touching packages/shared, which is out of this spec's scope; the
      // global exception filter turns an uncaught throw into a 500
      // INTERNAL_ERROR (same pattern as
      // modules/customers/application/use-cases/upsert-customer.use-case.ts
      // and modules/pricing/application/use-cases/get-quote.use-case.ts for
      // other unreachable-in-practice states).
      throw new Error('CreateTransactionUseCase: reference generation exhausted all attempts');
    }

    return this.attemptReserve(cmd, context, attempt + 1);
  }

  // The idempotency-key race: two requests both saw "no row" in
  // checkIdempotency and raced on insert. The loser's UnitOfWork already
  // rolled back (references/data-integrity.md#idempotency); replay the
  // winner's row exactly like a pre-existing-row replay.
  private replayAfterKeyCollision(
    cmd: CreateTransactionCommand,
  ): ResultAsync<ReserveOutcome, DomainError> {
    const { transactionRepository, deliveryRepository } = this.deps;

    return transactionRepository.findByIdempotencyKey(cmd.idempotencyKey).andThen((existing) => {
      if (!existing) {
        // The unique index guarantees the winner's row exists once our
        // insert collided on it; the rollback undoes only our own attempt.
        throw new Error(
          'CreateTransactionUseCase: idempotency key collision but no row found on replay',
        );
      }

      return deliveryRepository
        .findByTransactionId(existing.id)
        .map((delivery): ReserveOutcome => ({
          kind: 'REPLAYED',
          outcome: {
            view: toTransactionCreated(existing, this.requireDelivery(existing, delivery)),
            replayed: true,
          },
        }));
    });
  }

  private buildNewTransaction(
    cmd: CreateTransactionCommand,
    context: VerifiedContext,
    reference: string,
  ): NewTransaction {
    const { quote } = context;

    return {
      reference,
      idempotencyKey: cmd.idempotencyKey,
      requestHash: cmd.requestHash,
      customerId: cmd.customerId,
      productId: cmd.productId,
      quantity: cmd.quantity,
      unitPriceInCents: quote.product.unitPriceInCents,
      subtotalInCents: quote.subtotalInCents,
      baseFeeInCents: quote.baseFeeInCents,
      deliveryFeeInCents: quote.delivery.feeInCents,
      totalInCents: quote.totalInCents,
      currency: quote.currency,
      installments: cmd.installments,
      cardBrand: cmd.payment.cardBrand,
      cardLast4: cmd.payment.cardLast4,
      reservationExpiresAt: new Date(this.deps.clock.now().getTime() + RESERVATION_TTL_MS),
    };
  }

  private buildNewDelivery(
    cmd: CreateTransactionCommand,
    context: VerifiedContext,
    transactionId: string,
  ): NewDelivery {
    return {
      transactionId,
      warehouseId: context.quote.delivery.warehouse.id,
      municipalityCode: cmd.delivery.municipalityCode,
      recipientName: cmd.delivery.recipientName,
      phone: cmd.delivery.phone,
      addressLine: cmd.delivery.addressLine,
      addressDetail: cmd.delivery.addressDetail ?? null,
      distanceKm: context.quote.delivery.distanceKm,
      feeRule: context.quote.delivery.rule,
    };
  }

  // Called only after reserve()'s UnitOfWork has already committed — never
  // from inside one (references/data-integrity.md#stock, the "Charge"
  // decision in specs/08-api-create-transaction.md). createCharge is never
  // retried: a retry could double charge, and the reference lookup (api 06)
  // is the recovery path for a lost response.
  private charge(
    cmd: CreateTransactionCommand,
    reserved: ReservedContext,
  ): ResultAsync<CreateTransactionOutcome, never> {
    const { paymentGateway, transactionRepository, unitOfWork } = this.deps;
    const { transaction, delivery, customer } = reserved;

    return paymentGateway
      .createCharge({
        reference: transaction.reference,
        amountInCents: transaction.totalInCents,
        customerEmail: customer.email,
        installments: transaction.installments,
        cardToken: cmd.payment.cardToken,
        acceptanceToken: cmd.payment.acceptanceToken,
        personalAuthToken: cmd.payment.personalAuthToken,
      })
      .andThen((charge) =>
        unitOfWork
          .run((tx) =>
            transactionRepository.recordGatewayResponse(tx, {
              id: transaction.id,
              providerTransactionId: charge.providerTransactionId,
              statusMessage: charge.statusMessage,
            }),
          )
          .map((): CreateTransactionOutcome => ({
            view: toTransactionCreated(
              { ...transaction, providerStatusMessage: charge.statusMessage },
              delivery,
            ),
            replayed: false,
          })),
      )
      .orElse((error: PaymentGatewayError) =>
        error.kind === 'REJECTED'
          ? this.finalizeRejectedCharge(reserved, error.message)
          : this.stayPending(reserved),
      );
  }

  // A gateway 4xx is definitive: it refused the request before creating a
  // charge, so the reservation is released and the delivery cancelled. The
  // use case still returns Ok — a rejected charge is a valid terminal
  // state, not a use-case failure (still 201, per the spec's HTTP table).
  private finalizeRejectedCharge(
    reserved: ReservedContext,
    message: string,
  ): ResultAsync<CreateTransactionOutcome, never> {
    const { transaction, delivery } = reserved;

    return this.deps.finalizeTransactionUseCase
      .execute({ id: transaction.id, status: 'ERROR', statusMessage: message })
      .map((): CreateTransactionOutcome => ({
        view: toTransactionCreated(
          { ...transaction, status: TransactionStatus.ERROR, providerStatusMessage: message },
          { ...delivery, status: DeliveryStatus.CANCELLED },
        ),
        replayed: false,
      }));
  }

  // 5xx, a network error or a timeout are uncertain, never definitive: no
  // finalize, no recordGatewayResponse (there is no provider id to store).
  // The transaction stays exactly as inserted; the reconciler (api 06)
  // resolves it later by reference.
  private stayPending(reserved: ReservedContext): ResultAsync<CreateTransactionOutcome, never> {
    return okAsync({
      view: toTransactionCreated(reserved.transaction, reserved.delivery),
      replayed: false,
    });
  }

  private requireDelivery(transaction: Transaction, delivery: Delivery | null): Delivery {
    if (!delivery) {
      // A transaction always gets its delivery in the same reservation
      // phase; a missing one here means the data is corrupt, not a caller
      // mistake, so this crashes instead of returning a wrong view.
      throw new Error(`Transaction ${transaction.id} has no delivery`);
    }

    return delivery;
  }
}
