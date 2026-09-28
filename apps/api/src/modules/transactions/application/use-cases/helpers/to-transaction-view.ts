import { CURRENCY } from '@checkout/shared/constants';
import type { Currency, TransactionView } from '@checkout/shared/contracts';

import type { Product } from '../../../../catalog';
import type { Delivery } from '../../../../deliveries';
import type { Transaction } from '../../../domain/transaction';

// Transaction.currency is a loose `string` at the domain layer (it comes
// straight off an ORM column), but the schema only ever stores COP; this
// narrows without an `as` cast (same pattern as
// modules/transactions/application/use-cases/helpers/to-transaction-created.ts).
function toCurrency(value: string): Currency {
  if (value !== CURRENCY) {
    throw new Error(`Unexpected currency ${value}`);
  }
  return value;
}

export interface ToTransactionViewInput {
  readonly transaction: Transaction;
  readonly product: Product;
  readonly delivery: Delivery;
}

// Mechanical mapping (references/coding-conventions.md#c3): the (possibly
// re-read) transaction plus its product and delivery, rendered as the
// frozen TransactionView contract. Never touches customerId, so no email
// or document number can leak through this shape.
export function toTransactionView(input: ToTransactionViewInput): TransactionView {
  const { transaction, product, delivery } = input;

  return {
    id: transaction.id,
    reference: transaction.reference,
    status: transaction.status,
    statusMessage: transaction.providerStatusMessage,
    product: { id: product.id, name: product.name, imageUrl: product.imageUrl },
    quantity: transaction.quantity,
    installments: transaction.installments,
    amounts: {
      unitPriceInCents: transaction.unitPriceInCents,
      subtotalInCents: transaction.subtotalInCents,
      baseFeeInCents: transaction.baseFeeInCents,
      deliveryFeeInCents: transaction.deliveryFeeInCents,
      totalInCents: transaction.totalInCents,
      currency: toCurrency(transaction.currency),
    },
    card: { brand: transaction.cardBrand, last4: transaction.cardLast4 },
    delivery: { id: delivery.id, status: delivery.status },
    createdAt: transaction.createdAt.toISOString(),
    finalizedAt: transaction.finalizedAt ? transaction.finalizedAt.toISOString() : null,
  };
}
