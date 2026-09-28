import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';

import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import { ResultAsync } from '../../../../shared/domain/result';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { StockLine } from '../../application/ports/stock-reservation.port';
import type {
  TransactionRepository,
  TransactionUniqueViolation,
} from '../../application/ports/transaction.repository.port';
import { EMAIL_REPUBLISH_LEASE_MS, RECONCILER_LEASE_MS } from '../../domain/reconciler.constants';
import type { FinalStatus, NewTransaction, Transaction } from '../../domain/transaction';
import { toTransactionUniqueViolation } from './helpers/to-transaction-unique-violation';
import {
  toNewTransactionValues,
  toStockLineFromReturningRow,
  toTransaction,
  toTransactionFromReturningRow,
  type FinalizeReturningRow,
  type TransactionReturningRow,
} from './transaction.mapper';
import { TransactionOrmEntity } from './transaction.orm-entity';

// See typeorm-stock-reservation.repository.ts's `UpdateResult` for why a
// non-SELECT `manager.query` resolves to this tuple rather than bare rows.
type FinalizeQueryResult = [rows: FinalizeReturningRow[], affectedRowCount: number];

// See typeorm-stock-reservation.repository.ts's `UpdateResult` for the same
// tuple shape reasoning as FinalizeQueryResult above.
type ClaimQueryResult = [rows: TransactionReturningRow[], affectedRowCount: number];

// Leased claim: SELECT ... FOR UPDATE SKIP LOCKED picks the rows, the outer
// UPDATE bumps updated_at (the lease) and commits immediately — no lock is
// held across the caller's gateway call (references/layering.md — no
// network call while row locks are held). Each caller supplies its own
// filter/order predicate and the placeholder its limit is bound to; the
// shared shape is the CTE-less `UPDATE ... WHERE id IN (SELECT ...)
// RETURNING *` skeleton. `clock_timestamp()`, not `now()`: this must be the
// actual wall-clock instant the lease starts, not the enclosing
// transaction's frozen snapshot time.
function buildClaimSql(whereClause: string, limitPlaceholder: string): string {
  return `UPDATE transactions SET updated_at = clock_timestamp()
 WHERE id IN (SELECT id FROM transactions
               WHERE ${whereClause}
               ORDER BY updated_at LIMIT ${limitPlaceholder}
               FOR UPDATE SKIP LOCKED)
RETURNING *`;
}

// Params: [olderThan, limit]. PENDING with a known provider id, untouched
// since before `olderThan` — see references/coding-conventions.md#c11.
const CLAIM_PENDING_FOR_SYNC_SQL = buildClaimSql(
  "status = 'PENDING' AND provider_transaction_id IS NOT NULL AND updated_at < $1",
  '$2',
);

// Params: [now, leaseThreshold, limit]. PENDING, no provider id yet (the
// gateway response was lost), whose reservation already expired relative to
// `now`, and whose own lease (`now - RECONCILER_LEASE_MS`) has elapsed.
const CLAIM_EXPIRED_RESERVATIONS_SQL = buildClaimSql(
  'status = \'PENDING\' AND provider_transaction_id IS NULL AND reservation_expires_at < $1 AND updated_at < $2',
  '$3',
);

// Params: [finalizedBefore, leaseThreshold, limit]. Any final status
// (EXPIRED included), no email sent yet, finalized before `finalizedBefore`,
// and whose own lease (`now - EMAIL_REPUBLISH_LEASE_MS`, computed from the
// repository's own clock since this claim takes no `now`) has elapsed.
const FIND_UNSENT_EMAILS_SQL = buildClaimSql(
  "status <> 'PENDING' AND email_sent_at IS NULL AND finalized_at < $1 AND updated_at < $2",
  '$3',
);

// See docs/design/01-data-model.md#4-stock-operations for the verbatim
// statement; only the `:id`/`:final`/`:msg` placeholders became `$1`/`$2`.
// One literal-per-branch constant instead of a parametrized status, per
// references/coding-conventions.md#c11--raw-sql-scope ("the SQL itself is
// the guarantee") — the same fix already applied to deliveries' `transition`.
const FINALIZE_SQL_BY_STATUS: Readonly<Record<FinalStatus, string>> = {
  APPROVED: `UPDATE transactions SET status = 'APPROVED', finalized_at = now(), updated_at = now(), provider_status_message = $2
 WHERE id = $1 AND status = 'PENDING' RETURNING product_id, quantity`,
  DECLINED: `UPDATE transactions SET status = 'DECLINED', finalized_at = now(), updated_at = now(), provider_status_message = $2
 WHERE id = $1 AND status = 'PENDING' RETURNING product_id, quantity`,
  VOIDED: `UPDATE transactions SET status = 'VOIDED', finalized_at = now(), updated_at = now(), provider_status_message = $2
 WHERE id = $1 AND status = 'PENDING' RETURNING product_id, quantity`,
  ERROR: `UPDATE transactions SET status = 'ERROR', finalized_at = now(), updated_at = now(), provider_status_message = $2
 WHERE id = $1 AND status = 'PENDING' RETURNING product_id, quantity`,
  EXPIRED: `UPDATE transactions SET status = 'EXPIRED', finalized_at = now(), updated_at = now(), provider_status_message = $2
 WHERE id = $1 AND status = 'PENDING' RETURNING product_id, quantity`,
};

@Injectable()
export class TypeOrmTransactionRepository implements TransactionRepository {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  findById(id: string, tx?: TxContext): ResultAsync<Transaction | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .findOne(TransactionOrmEntity, { where: { id } })
      .then((entity) => (entity ? toTransaction(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }

  findByIdempotencyKey(key: string, tx?: TxContext): ResultAsync<Transaction | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .findOne(TransactionOrmEntity, { where: { idempotencyKey: key } })
      .then((entity) => (entity ? toTransaction(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }

  insert(
    tx: TxContext,
    transaction: NewTransaction,
  ): ResultAsync<Transaction, TransactionUniqueViolation> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const promise = manager
      .createQueryBuilder()
      .insert()
      .into(TransactionOrmEntity)
      .values(toNewTransactionValues(transaction))
      .returning('*')
      .execute()
      .then((result) => {
        const [row] = result.raw as TransactionReturningRow[];
        // The insert we just ran is the only writer of this row; a missing
        // row here would mean the driver silently dropped it, which is an
        // unexpected failure, not an expected one (see C9).
        if (!row) throw new Error('insert: no row returned for the new transaction');
        return toTransactionFromReturningRow(row);
      });

    return ResultAsync.fromPromise(promise, (error) => {
      const violation = toTransactionUniqueViolation(error);
      if (violation) return violation;
      // Not a unique-constraint violation on this table: an unexpected
      // failure, so it is re-thrown rather than folded into the Result
      // (see references/coding-conventions.md#c9).
      throw error;
    });
  }

  recordGatewayResponse(
    tx: TxContext,
    response: { id: string; providerTransactionId: string; statusMessage: string | null },
  ): ResultAsync<void, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query: Promise<void> = manager
      .createQueryBuilder()
      .update(TransactionOrmEntity)
      .set({
        providerTransactionId: response.providerTransactionId,
        providerStatusMessage: response.statusMessage,
      })
      .where('id = :id', { id: response.id })
      .execute()
      .then(() => undefined);

    return ResultAsync.fromSafePromise(query);
  }

  finalize(
    tx: TxContext,
    outcome: { id: string; status: FinalStatus; statusMessage: string | null },
  ): ResultAsync<StockLine | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const sql = FINALIZE_SQL_BY_STATUS[outcome.status];
    // Like the reserve/commit/release statements in
    // typeorm-stock-reservation.repository.ts, a non-SELECT statement (even
    // one with RETURNING) resolves to `[rows, affectedRowCount]`, not a bare
    // rows array.
    const query = manager
      .query(sql, [outcome.id, outcome.statusMessage])
      .then((result: FinalizeQueryResult) => {
        const [rows] = result;
        const [row] = rows;
        return row ? toStockLineFromReturningRow(row) : null;
      });

    return ResultAsync.fromSafePromise(query);
  }

  findByProviderTransactionId(providerTransactionId: string): ResultAsync<Transaction | null, never> {
    const query = this.manager
      .findOne(TransactionOrmEntity, { where: { providerTransactionId } })
      .then((entity) => (entity ? toTransaction(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }

  // Conditional on email_sent_at IS NULL so a second call (e.g. two
  // reconciler runs racing after the lease expired) leaves the first
  // timestamp untouched rather than bumping it.
  markEmailSent(tx: TxContext, id: string): ResultAsync<void, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query: Promise<void> = manager
      .createQueryBuilder()
      .update(TransactionOrmEntity)
      .set({ emailSentAt: () => 'now()' })
      .where('id = :id AND email_sent_at IS NULL', { id })
      .execute()
      .then(() => undefined);

    return ResultAsync.fromSafePromise(query);
  }

  claimPendingForSync(
    tx: TxContext,
    query: { olderThan: Date; limit: number },
  ): ResultAsync<Transaction[], never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const promise = manager
      .query(CLAIM_PENDING_FOR_SYNC_SQL, [query.olderThan, query.limit])
      .then((result: ClaimQueryResult) => {
        const [rows] = result;
        return rows.map(toTransactionFromReturningRow);
      });

    return ResultAsync.fromSafePromise(promise);
  }

  claimExpiredReservations(
    tx: TxContext,
    query: { now: Date; limit: number },
  ): ResultAsync<Transaction[], never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const leaseThreshold = new Date(query.now.getTime() - RECONCILER_LEASE_MS);
    const promise = manager
      .query(CLAIM_EXPIRED_RESERVATIONS_SQL, [query.now, leaseThreshold, query.limit])
      .then((result: ClaimQueryResult) => {
        const [rows] = result;
        return rows.map(toTransactionFromReturningRow);
      });

    return ResultAsync.fromSafePromise(promise);
  }

  // Runs as its own autocommit statement through the constructor's manager
  // (no `tx`, per the port), so it is never nested inside another caller's
  // unit of work.
  findUnsentEmails(query: {
    finalizedBefore: Date;
    limit: number;
  }): ResultAsync<Transaction[], never> {
    const leaseThreshold = new Date(Date.now() - EMAIL_REPUBLISH_LEASE_MS);
    const promise = this.manager
      .query(FIND_UNSENT_EMAILS_SQL, [query.finalizedBefore, leaseThreshold, query.limit])
      .then((result: ClaimQueryResult) => {
        const [rows] = result;
        return rows.map(toTransactionFromReturningRow);
      });

    return ResultAsync.fromSafePromise(promise);
  }
}
