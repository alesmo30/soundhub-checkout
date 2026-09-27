import { QueryFailedError } from 'typeorm';

import type { CustomerUniqueViolation } from '../../../application/ports/customer.repository.port';

// Confirmed against a real Postgres 16 by inserting an actual duplicate: the
// pg driver's error carries SQLSTATE 23505 as `code` and the violated unique
// index's name as `constraint` (see migration 1790463118000-initial-schema).
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';

const CUSTOMER_CONSTRAINT_BY_INDEX_NAME: Readonly<
  Record<string, CustomerUniqueViolation['constraint']>
> = {
  uq_customers_document: 'DOCUMENT',
  uq_customers_email: 'EMAIL',
};

interface PostgresUniqueViolationError {
  readonly code: string;
  readonly constraint: string;
}

function isPostgresUniqueViolationError(
  driverError: unknown,
): driverError is PostgresUniqueViolationError {
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    'constraint' in driverError &&
    typeof driverError.code === 'string' &&
    typeof driverError.constraint === 'string'
  );
}

/**
 * Narrows a thrown TypeORM error into a `CustomerUniqueViolation` when it is
 * a Postgres unique_violation (23505) on `uq_customers_document` or
 * `uq_customers_email`. Any other error — a different SQLSTATE, an unrelated
 * constraint, or an error that isn't a `QueryFailedError` at all — returns
 * `null` so the caller re-throws it (see references/coding-conventions.md#c9).
 */
export function toUniqueViolation(error: unknown): CustomerUniqueViolation | null {
  if (!(error instanceof QueryFailedError)) return null;
  if (!isPostgresUniqueViolationError(error.driverError)) return null;
  if (error.driverError.code !== POSTGRES_UNIQUE_VIOLATION_CODE) return null;

  const constraint = CUSTOMER_CONSTRAINT_BY_INDEX_NAME[error.driverError.constraint];
  return constraint ? { constraint } : null;
}
