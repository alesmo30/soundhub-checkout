import { CURRENCY } from '@checkout/shared/constants';
import type { Currency, TransactionCreated } from '@checkout/shared/contracts';

import type { Delivery } from '../../../../deliveries';
import type { Transaction } from '../../../domain/transaction';

// Transaction.currency is a loose `string` at the domain layer (it comes
// straight off an ORM column), but the schema only ever stores COP; this
// narrows without an `as` cast (see references/coding-conventions.md#c5).
function toCurrency(value: string): Currency {
  if (value !== CURRENCY) {
    throw new Error(`Unexpected currency ${value}`);
  }
  return value;
}

// Mechanical mapping (references/coding-conventions.md#c3): every phase of
// CreateTransactionUseCase that must render a transaction + its delivery as
// the API's TransactionCreated shape goes through this one place.
export function toTransactionCreated(
  transaction: Transaction,
  delivery: Delivery,
): TransactionCreated {
  return {
    id: transaction.id,
    reference: transaction.reference,
    status: transaction.status,
    statusMessage: transaction.providerStatusMessage,
    totalInCents: transaction.totalInCents,
    currency: toCurrency(transaction.currency),
    delivery: { id: delivery.id, status: delivery.status },
    createdAt: transaction.createdAt.toISOString(),
  };
}
