import { maxPurchaseQuantity } from './purchase-limit';

describe('maxPurchaseQuantity', () => {
  it('returns 0 when there is no stock', () => {
    expect(maxPurchaseQuantity(0)).toBe(0);
  });

  it('returns the stock when it is below the per-order cap', () => {
    expect(maxPurchaseQuantity(1)).toBe(1);
  });

  it('returns the stock when it exactly matches the per-order cap', () => {
    expect(maxPurchaseQuantity(10)).toBe(10);
  });

  it('caps the result at MAX_QUANTITY when stock exceeds it', () => {
    expect(maxPurchaseQuantity(25)).toBe(10);
  });
});
