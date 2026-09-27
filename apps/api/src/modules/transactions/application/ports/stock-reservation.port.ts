import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import type { ResultAsync } from '../../../../shared/domain/result';

// Implemented by catalog (raw SQL), declared here because transactions is
// the consumer (see references/03-folder-structure.md).
export const STOCK_RESERVATION = Symbol('STOCK_RESERVATION');

export type StockReservationOutcome = 'RESERVED' | 'INSUFFICIENT_STOCK';

export interface StockLine {
  readonly productId: string;
  readonly quantity: number;
}

export interface StockReservationPort {
  reserve(tx: TxContext, line: StockLine): ResultAsync<StockReservationOutcome, never>;
  commit(tx: TxContext, line: StockLine): ResultAsync<void, never>;
  release(tx: TxContext, line: StockLine): ResultAsync<void, never>;
}
