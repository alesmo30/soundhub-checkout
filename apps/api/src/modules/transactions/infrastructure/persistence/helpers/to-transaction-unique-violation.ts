import { QueryFailedError } from 'typeorm';

import type { TransactionUniqueViolation } from '../../../application/ports/transaction.repository.port';

// Confirmed against a real Postgres 16 by inserting an actual duplicate: the
// pg driver's error carries SQLSTATE 23505 as `code` and the violated unique
// index's name as `constraint` (see migration 1790463118000-initial-schema).
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';

// `reference` and `idempotency_key` are inline column-level UNIQUE
// constraints (see docs/design/01-data-model.md#3-ddl), so Postgres names
// them after its own default convention: `<table>_<column>_key`.
const TRANSACTION_CONSTRAINT_BY_INDEX_NAME: Readonly<
  Record<string, TransactionUniqueViolation['constraint']>
> = {
  transactions_idempotency_key_key: 'IDEMPOTENCY_KEY',
  transactions_reference_key: 'REFERENCE',
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
 * Narrows a thrown TypeORM error into a `TransactionUniqueViolation` when it
 * is a Postgres unique_violation (23505) on `transactions_idempotency_key_key`
 * or `transactions_reference_key`. Any other error — a different SQLSTATE,
 * an unrelated constraint, or an error that isn't a `QueryFailedError` at all
 * — returns `null` so the caller re-throws it (see
 * references/coding-conventions.md#c9).
 */
export function toTransactionUniqueViolation(error: unknown): TransactionUniqueViolation | null {
  if (!(error instanceof QueryFailedError)) return null;
  if (!isPostgresUniqueViolationError(error.driverError)) return null;
  if (error.driverError.code !== POSTGRES_UNIQUE_VIOLATION_CODE) return null;

  const constraint = TRANSACTION_CONSTRAINT_BY_INDEX_NAME[error.driverError.constraint];
  return constraint ? { constraint } : null;
}
