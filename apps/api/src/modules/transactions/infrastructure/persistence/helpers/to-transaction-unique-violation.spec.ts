import { QueryFailedError } from 'typeorm';

import { toTransactionUniqueViolation } from './to-transaction-unique-violation';

function buildQueryFailedError(driverError: unknown): QueryFailedError {
  return new QueryFailedError('INSERT ...', [], driverError as Error);
}

describe('toTransactionUniqueViolation', () => {
  it("maps a 23505 on transactions_idempotency_key_key to Err({ constraint: 'IDEMPOTENCY_KEY' })", () => {
    const error = buildQueryFailedError({
      code: '23505',
      constraint: 'transactions_idempotency_key_key',
    });

    expect(toTransactionUniqueViolation(error)).toEqual({ constraint: 'IDEMPOTENCY_KEY' });
  });

  it("maps a 23505 on transactions_reference_key to Err({ constraint: 'REFERENCE' })", () => {
    const error = buildQueryFailedError({
      code: '23505',
      constraint: 'transactions_reference_key',
    });

    expect(toTransactionUniqueViolation(error)).toEqual({ constraint: 'REFERENCE' });
  });

  it('returns null for a 23505 on an unrelated constraint', () => {
    const error = buildQueryFailedError({
      code: '23505',
      constraint: 'some_other_table_unique_key',
    });

    expect(toTransactionUniqueViolation(error)).toBeNull();
  });

  it('returns null for a non-unique-violation SQLSTATE', () => {
    const error = buildQueryFailedError({
      code: '23503',
      constraint: 'transactions_idempotency_key_key',
    });

    expect(toTransactionUniqueViolation(error)).toBeNull();
  });

  it('returns null when the driver error has no code or constraint', () => {
    const error = buildQueryFailedError({ message: 'boom' });

    expect(toTransactionUniqueViolation(error)).toBeNull();
  });

  it('returns null when the driver error is not an object', () => {
    const error = buildQueryFailedError('boom');

    expect(toTransactionUniqueViolation(error)).toBeNull();
  });

  it('returns null for an error that is not a QueryFailedError at all', () => {
    expect(toTransactionUniqueViolation(new Error('unexpected'))).toBeNull();
  });
});
