import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';

import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import { ResultAsync } from '../../../../shared/domain/result';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type {
  StockLine,
  StockReservationOutcome,
  StockReservationPort,
} from '../../../transactions';

// `EntityManager.query` on an UPDATE with no RETURNING resolves to
// `[rows, affectedRowCount]` (see PostgresQueryRunner); rows is always `[]`
// here, so only the count is read.
type UpdateResult = [rows: unknown[], affectedRowCount: number];

// See docs/design/01-data-model.md#4-stock-operations for the verbatim
// statements; only the `:name` placeholders became `$1`/`$2`.
const RESERVE_SQL = `UPDATE products SET stock_available = stock_available - $2, stock_reserved = stock_reserved + $2, updated_at = now()
 WHERE id = $1 AND stock_available >= $2 AND deleted_at IS NULL`;

const COMMIT_SQL = `UPDATE products SET stock_reserved = stock_reserved - $2, updated_at = now() WHERE id = $1`;

const RELEASE_SQL = `UPDATE products SET stock_available = stock_available + $2, stock_reserved = stock_reserved - $2, updated_at = now() WHERE id = $1`;

@Injectable()
export class TypeOrmStockReservationRepository implements StockReservationPort {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  reserve(tx: TxContext, line: StockLine): ResultAsync<StockReservationOutcome, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .query(RESERVE_SQL, [line.productId, line.quantity])
      .then((result: UpdateResult) => {
        const [, affectedRowCount] = result;
        return affectedRowCount > 0 ? 'RESERVED' : 'INSUFFICIENT_STOCK';
      });

    return ResultAsync.fromSafePromise(query);
  }

  commit(tx: TxContext, line: StockLine): ResultAsync<void, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query: Promise<void> = manager
      .query(COMMIT_SQL, [line.productId, line.quantity])
      .then(() => undefined);

    return ResultAsync.fromSafePromise(query);
  }

  release(tx: TxContext, line: StockLine): ResultAsync<void, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query: Promise<void> = manager
      .query(RELEASE_SQL, [line.productId, line.quantity])
      .then(() => undefined);

    return ResultAsync.fromSafePromise(query);
  }
}
