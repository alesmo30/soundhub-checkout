import { QueryFailedError } from 'typeorm';

import { toUniqueViolation } from './to-unique-violation';

function buildQueryFailedError(driverError: unknown): QueryFailedError {
  return new QueryFailedError('INSERT INTO customers (...)', [], driverError as Error);
}

describe('toUniqueViolation', () => {
  it('maps a 23505 on uq_customers_document to Err({ constraint: "DOCUMENT" })', () => {
    const error = buildQueryFailedError({ code: '23505', constraint: 'uq_customers_document' });

    expect(toUniqueViolation(error)).toEqual({ constraint: 'DOCUMENT' });
  });

  it('maps a 23505 on uq_customers_email to Err({ constraint: "EMAIL" })', () => {
    const error = buildQueryFailedError({ code: '23505', constraint: 'uq_customers_email' });

    expect(toUniqueViolation(error)).toEqual({ constraint: 'EMAIL' });
  });

  it('returns null for a SQLSTATE other than 23505', () => {
    const error = buildQueryFailedError({ code: '23503', constraint: 'fk_transactions_customer' });

    expect(toUniqueViolation(error)).toBeNull();
  });

  it('returns null for a 23505 on a constraint outside the customers table', () => {
    const error = buildQueryFailedError({ code: '23505', constraint: 'uq_products_sku' });

    expect(toUniqueViolation(error)).toBeNull();
  });

  it('returns null when the driverError has no code/constraint shape', () => {
    const error = buildQueryFailedError({ message: 'connection reset' });

    expect(toUniqueViolation(error)).toBeNull();
  });

  it('returns null for an error that is not a QueryFailedError at all', () => {
    expect(toUniqueViolation(new Error('boom'))).toBeNull();
    expect(toUniqueViolation('not even an Error')).toBeNull();
  });
});
