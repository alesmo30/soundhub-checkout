import { ErrorCode } from './error-code';

describe('ErrorCode', () => {
  it('has exactly the 17 codes from the API contract', () => {
    const expected = [
      'VALIDATION_ERROR',
      'MISSING_IDEMPOTENCY_KEY',
      'PRODUCT_NOT_FOUND',
      'DEPARTMENT_NOT_FOUND',
      'MUNICIPALITY_NOT_FOUND',
      'CUSTOMER_NOT_FOUND',
      'TRANSACTION_NOT_FOUND',
      'DELIVERY_NOT_FOUND',
      'OUT_OF_STOCK',
      'PRICE_CHANGED',
      'EMAIL_ALREADY_REGISTERED',
      'CUSTOMER_DATA_MISMATCH',
      'IDEMPOTENCY_KEY_REUSED',
      'RATE_LIMITED',
      'PAYMENT_GATEWAY_UNAVAILABLE',
      'INVALID_SIGNATURE',
      'INTERNAL_ERROR',
    ];

    expect(Object.keys(ErrorCode)).toHaveLength(17);
    expect(Object.values(ErrorCode).sort()).toEqual([...expected].sort());
  });
});
