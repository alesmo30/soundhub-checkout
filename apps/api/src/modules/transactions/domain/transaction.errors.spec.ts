import { ErrorCode } from '@checkout/shared/enums';

import {
  customerNotFoundForPayment,
  idempotencyKeyReused,
  invalidSignature,
  missingIdempotencyKey,
  outOfStockOnReserve,
  paymentGatewayUnavailable,
  priceChanged,
} from './transaction.errors';

describe('missingIdempotencyKey', () => {
  it('builds a VALIDATION domain error', () => {
    const error = missingIdempotencyKey();

    expect(error.code).toBe(ErrorCode.MISSING_IDEMPOTENCY_KEY);
    expect(error.kind).toBe('VALIDATION');
  });
});

describe('idempotencyKeyReused', () => {
  it('builds an UNPROCESSABLE domain error', () => {
    const error = idempotencyKeyReused();

    expect(error.code).toBe(ErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(error.kind).toBe('UNPROCESSABLE');
  });
});

describe('priceChanged', () => {
  it('builds a CONFLICT domain error carrying both amounts', () => {
    const error = priceChanged(100_000, 120_000);

    expect(error.code).toBe(ErrorCode.PRICE_CHANGED);
    expect(error.kind).toBe('CONFLICT');
    expect(error.detail).toContain('100000');
    expect(error.detail).toContain('120000');
  });
});

describe('outOfStockOnReserve', () => {
  it('builds a CONFLICT domain error', () => {
    const error = outOfStockOnReserve();

    expect(error.code).toBe(ErrorCode.OUT_OF_STOCK);
    expect(error.kind).toBe('CONFLICT');
  });
});

describe('customerNotFoundForPayment', () => {
  it('builds an UNPROCESSABLE domain error', () => {
    const error = customerNotFoundForPayment();

    expect(error.code).toBe(ErrorCode.CUSTOMER_NOT_FOUND);
    expect(error.kind).toBe('UNPROCESSABLE');
  });
});

describe('paymentGatewayUnavailable', () => {
  it('builds an UNAVAILABLE domain error', () => {
    const error = paymentGatewayUnavailable();

    expect(error.code).toBe(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE);
    expect(error.kind).toBe('UNAVAILABLE');
  });
});

describe('invalidSignature', () => {
  it('builds an UNAUTHORIZED domain error', () => {
    const error = invalidSignature();

    expect(error.code).toBe(ErrorCode.INVALID_SIGNATURE);
    expect(error.kind).toBe('UNAUTHORIZED');
  });
});
