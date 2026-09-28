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

const NOT_IMPLEMENTED_MESSAGE = 'Not implemented — api 06';

// See typeorm-stock-reservation.repository.ts's `UpdateResult` for why a
// non-SELECT `manager.query` resolves to this tuple rather than bare rows.
type FinalizeQueryResult = [rows: FinalizeReturningRow[], affectedRowCount: number];

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

  // The reconciler's own shape (locking strategy, batching, retry policy)
  // is not decided by this spec — it belongs to api 06 (see
  // specs/08-api-create-transaction.md, "Adapters").
  markEmailSent(): ResultAsync<void, never> {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }

  claimPendingForSync(): ResultAsync<Transaction[], never> {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }

  claimExpiredReservations(): ResultAsync<Transaction[], never> {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }

  findUnsentEmails(): ResultAsync<Transaction[], never> {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
}
