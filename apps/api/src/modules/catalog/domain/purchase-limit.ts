import { MAX_QUANTITY } from '@checkout/shared/constants';

/**
 * MAX_QUANTITY mirrors the frozen transactions.quantity CHECK (BETWEEN 1 AND
 * 10) — a per-order cap, not a stock-driven one. A product may have more
 * stock than that; the cap still applies.
 */
export function maxPurchaseQuantity(stockAvailable: number): number {
  return Math.min(stockAvailable, MAX_QUANTITY);
}
