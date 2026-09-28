import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import type { ResultAsync } from '../../../../shared/domain/result';
import type { FinalStatus, NewTransaction, Transaction } from '../../domain/transaction';
import type { StockLine } from './stock-reservation.port';

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');

// transactions_idempotency_key_key | transactions_reference_key
export interface TransactionUniqueViolation {
  readonly constraint: 'IDEMPOTENCY_KEY' | 'REFERENCE';
}

export interface TransactionRepository {
  findById(id: string, tx?: TxContext): ResultAsync<Transaction | null, never>;
  findByIdempotencyKey(key: string, tx?: TxContext): ResultAsync<Transaction | null, never>;
  // Looked up on the signed `data.transaction.id` from a payment webhook
  // event; never on a caller-supplied reference (see transaction-reference's
  // absence from the trusted signature — spec 12a's webhook decisions).
  findByProviderTransactionId(
    providerTransactionId: string,
  ): ResultAsync<Transaction | null, never>;
  insert(
    tx: TxContext,
    transaction: NewTransaction,
  ): ResultAsync<Transaction, TransactionUniqueViolation>;
  recordGatewayResponse(
    tx: TxContext,
    response: { id: string; providerTransactionId: string; statusMessage: string | null },
  ): ResultAsync<void, never>;
  // Raw SQL: conditional UPDATE ... WHERE status = 'PENDING'. Returns null
  // when already finalized (idempotent), the released stock line otherwise.
  finalize(
    tx: TxContext,
    outcome: { id: string; status: FinalStatus; statusMessage: string | null },
  ): ResultAsync<StockLine | null, never>;
  // Conditional UPDATE ... WHERE email_sent_at IS NULL, so a second call
  // after the first leaves the original timestamp untouched.
  markEmailSent(tx: TxContext, id: string): ResultAsync<void, never>;
  // Leased claim: `SELECT ... FOR UPDATE SKIP LOCKED` then
  // `UPDATE ... SET updated_at = now()`, committed immediately. The bumped
  // updated_at is the lease — `olderThan` is compared against it, so a
  // concurrent reconciler run skips whatever this call just claimed until
  // the lease (RECONCILER_LEASE_MS) expires.
  claimPendingForSync(
    tx: TxContext,
    query: { olderThan: Date; limit: number },
  ): ResultAsync<Transaction[], never>;
  // Leased claim, same shape as claimPendingForSync. The lease window here is
  // RECONCILER_LEASE_MS, measured against `now` (the caller's clock), not a
  // caller-supplied `olderThan`.
  claimExpiredReservations(
    tx: TxContext,
    query: { now: Date; limit: number },
  ): ResultAsync<Transaction[], never>;
  // Leased claim (EMAIL_REPUBLISH_LEASE_MS): guarantees at most one
  // re-publish per transaction every lease window, regardless of how often
  // the reconciler runs.
  findUnsentEmails(query: {
    finalizedBefore: Date;
    limit: number;
  }): ResultAsync<Transaction[], never>;
}
