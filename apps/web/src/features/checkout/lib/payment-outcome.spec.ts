import { mapErrorToOutcome } from './payment-outcome';

function problem(status: number, code: string) {
  return { status, data: { code } };
}

describe('mapErrorToOutcome', () => {
  it('maps 409 PRICE_CHANGED to a rotated key with the pending entry cleared', () => {
    expect(mapErrorToOutcome(problem(409, 'PRICE_CHANGED'))).toEqual({
      kind: 'PRICE_CHANGED',
      key: 'ROTATE',
      pending: 'CLEAR',
    });
  });

  it('maps 409 OUT_OF_STOCK to a rotated key with the pending entry cleared', () => {
    expect(mapErrorToOutcome(problem(409, 'OUT_OF_STOCK'))).toEqual({
      kind: 'OUT_OF_STOCK',
      key: 'ROTATE',
      pending: 'CLEAR',
    });
  });

  it('maps 409 EMAIL_ALREADY_REGISTERED to a rotated key', () => {
    expect(mapErrorToOutcome(problem(409, 'EMAIL_ALREADY_REGISTERED'))).toEqual({
      kind: 'EMAIL_ALREADY_REGISTERED',
      key: 'ROTATE',
      pending: 'CLEAR',
    });
  });

  it('maps 409 CUSTOMER_DATA_MISMATCH to a rotated key', () => {
    expect(mapErrorToOutcome(problem(409, 'CUSTOMER_DATA_MISMATCH'))).toEqual({
      kind: 'CUSTOMER_DATA_MISMATCH',
      key: 'ROTATE',
      pending: 'CLEAR',
    });
  });

  it('maps 503 PAYMENT_GATEWAY_UNAVAILABLE to a kept key with the pending entry cleared', () => {
    expect(mapErrorToOutcome(problem(503, 'PAYMENT_GATEWAY_UNAVAILABLE'))).toEqual({
      kind: 'UNAVAILABLE',
      key: 'KEEP',
      pending: 'CLEAR',
    });
  });

  it('maps 429 RATE_LIMITED to a kept key with the pending entry cleared', () => {
    expect(mapErrorToOutcome(problem(429, 'RATE_LIMITED'))).toEqual({
      kind: 'RATE_LIMITED',
      key: 'KEEP',
      pending: 'CLEAR',
    });
  });

  it('maps a network error (FETCH_ERROR) to an uncertain outcome that keeps both', () => {
    expect(mapErrorToOutcome({ status: 'FETCH_ERROR', error: 'Failed to fetch' })).toEqual({
      kind: 'UNCERTAIN',
      key: 'KEEP',
      pending: 'KEEP',
    });
  });

  it('maps a timeout to an uncertain outcome', () => {
    expect(mapErrorToOutcome({ status: 'TIMEOUT_ERROR', error: 'timeout' })).toEqual({
      kind: 'UNCERTAIN',
      key: 'KEEP',
      pending: 'KEEP',
    });
  });

  it('maps an unmapped 5xx to an uncertain outcome', () => {
    expect(mapErrorToOutcome(problem(502, 'INTERNAL_ERROR'))).toEqual({
      kind: 'UNCERTAIN',
      key: 'KEEP',
      pending: 'KEEP',
    });
  });

  it('maps 400 to a failed outcome with a rotated key', () => {
    expect(mapErrorToOutcome(problem(400, 'VALIDATION_ERROR'))).toEqual({
      kind: 'FAILED',
      key: 'ROTATE',
      pending: 'CLEAR',
    });
  });

  it('maps 422 to a failed outcome with a rotated key', () => {
    expect(mapErrorToOutcome(problem(422, 'IDEMPOTENCY_KEY_REUSED'))).toEqual({
      kind: 'FAILED',
      key: 'ROTATE',
      pending: 'CLEAR',
    });
  });

  it('treats an error with no recognizable shape as uncertain, never assuming nothing was charged', () => {
    expect(mapErrorToOutcome(null)).toEqual({
      kind: 'UNCERTAIN',
      key: 'KEEP',
      pending: 'KEEP',
    });
    expect(mapErrorToOutcome('boom')).toEqual({
      kind: 'UNCERTAIN',
      key: 'KEEP',
      pending: 'KEEP',
    });
  });
});
