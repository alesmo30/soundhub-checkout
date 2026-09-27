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
  markEmailSent(tx: TxContext, id: string): ResultAsync<void, never>;
  // Raw SQL: SELECT ... FOR UPDATE SKIP LOCKED.
  claimPendingForSync(
    tx: TxContext,
    query: { olderThan: Date; limit: number },
  ): ResultAsync<Transaction[], never>;
  // Raw SQL: SELECT ... FOR UPDATE SKIP LOCKED.
  claimExpiredReservations(
    tx: TxContext,
    query: { now: Date; limit: number },
  ): ResultAsync<Transaction[], never>;
  findUnsentEmails(query: {
    finalizedBefore: Date;
    limit: number;
  }): ResultAsync<Transaction[], never>;
}
