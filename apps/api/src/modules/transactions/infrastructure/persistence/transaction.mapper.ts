import type { CardBrand, TransactionStatus } from '@checkout/shared/enums';

import { bigintTransformer } from '../../../../shared/infrastructure/persistence/transformers';
import type { StockLine } from '../../application/ports/stock-reservation.port';
import type { NewTransaction, Transaction } from '../../domain/transaction';
import type { TransactionOrmEntity } from './transaction.orm-entity';

// bigintTransformer.from is typed `(value) => number | null`, but a money
// column on `transactions` is never null (see docs/design/01-data-model.md#3-ddl);
// narrowing at runtime avoids an `as` cast (see references/coding-conventions.md#c5).
function centsFrom(value: string): number {
  const parsed = bigintTransformer.from(value);
  if (parsed === null) throw new Error(`Expected a non-null money value, got ${value}`);
  return parsed;
}

export function toTransaction(entity: TransactionOrmEntity): Transaction {
  return {
    id: entity.id,
    reference: entity.reference,
    idempotencyKey: entity.idempotencyKey,
    requestHash: entity.requestHash,
    customerId: entity.customerId,
    productId: entity.productId,
    quantity: entity.quantity,
    unitPriceInCents: entity.unitPriceCents,
    subtotalInCents: entity.subtotalCents,
    baseFeeInCents: entity.baseFeeCents,
    deliveryFeeInCents: entity.deliveryFeeCents,
    totalInCents: entity.totalCents,
    currency: entity.currency,
    status: entity.status,
    installments: entity.installments,
    cardBrand: entity.cardBrand,
    cardLast4: entity.cardLast4,
    providerTransactionId: entity.providerTransactionId,
    providerStatusMessage: entity.providerStatusMessage,
    reservationExpiresAt: entity.reservationExpiresAt,
    finalizedAt: entity.finalizedAt,
    emailSentAt: entity.emailSentAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  };
}

// The domain's money fields end in `InCents` (see transaction.ts); the DDL
// and the ORM entity end them in `Cents` (see docs/design/01-data-model.md#3-ddl).
// Everything else is a 1:1 property match, but this mismatch means `insert`
// cannot pass `NewTransaction` straight into the query builder's `.values()`.
export function toNewTransactionValues(
  transaction: NewTransaction,
): Omit<TransactionOrmEntity, 'id' | 'status' | NonNewOrmColumns> {
  return {
    reference: transaction.reference,
    idempotencyKey: transaction.idempotencyKey,
    requestHash: transaction.requestHash,
    customerId: transaction.customerId,
    productId: transaction.productId,
    quantity: transaction.quantity,
    unitPriceCents: transaction.unitPriceInCents,
    subtotalCents: transaction.subtotalInCents,
    baseFeeCents: transaction.baseFeeInCents,
    deliveryFeeCents: transaction.deliveryFeeInCents,
    totalCents: transaction.totalInCents,
    currency: transaction.currency,
    installments: transaction.installments,
    cardBrand: transaction.cardBrand,
    cardLast4: transaction.cardLast4,
    reservationExpiresAt: transaction.reservationExpiresAt,
  };
}

// Columns the DB assigns on insert: default status, no gateway response yet,
// and the timestamp columns are DB-managed (see NewTransaction in transaction.ts).
type NonNewOrmColumns =
  | 'providerTransactionId'
  | 'providerStatusMessage'
  | 'finalizedAt'
  | 'emailSentAt'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt';

// `UPDATE ... RETURNING product_id, quantity` comes back as the pg driver's
// raw row (real Postgres column names), like customer.mapper.ts's
// `CustomerReturningRow` for the same reason.
export interface FinalizeReturningRow {
  readonly product_id: string;
  readonly quantity: number;
}

export function toStockLineFromReturningRow(row: FinalizeReturningRow): StockLine {
  return { productId: row.product_id, quantity: row.quantity };
}

// `INSERT ... RETURNING *` also comes back as the pg driver's raw row: real
// Postgres column names, and bigint money columns as strings. Unlike
// `findOne`/`find`, an insert via the query builder does not re-run each
// column's TypeORM transformer on `generatedMaps`, so reading `result.raw[0]`
// and converting the money columns here is what keeps `insert`'s Transaction
// consistent with the one `findById` returns right after.
export interface TransactionReturningRow {
  readonly id: string;
  readonly reference: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly customer_id: string;
  readonly product_id: string;
  readonly quantity: number;
  readonly unit_price_cents: string;
  readonly subtotal_cents: string;
  readonly base_fee_cents: string;
  readonly delivery_fee_cents: string;
  readonly total_cents: string;
  readonly currency: string;
  readonly status: TransactionStatus;
  readonly installments: number;
  readonly card_brand: CardBrand;
  readonly card_last4: string;
  readonly provider_transaction_id: string | null;
  readonly provider_status_message: string | null;
  readonly reservation_expires_at: Date;
  readonly finalized_at: Date | null;
  readonly email_sent_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly deleted_at: Date | null;
}

export function toTransactionFromReturningRow(row: TransactionReturningRow): Transaction {
  return {
    id: row.id,
    reference: row.reference,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    customerId: row.customer_id,
    productId: row.product_id,
    quantity: row.quantity,
    unitPriceInCents: centsFrom(row.unit_price_cents),
    subtotalInCents: centsFrom(row.subtotal_cents),
    baseFeeInCents: centsFrom(row.base_fee_cents),
    deliveryFeeInCents: centsFrom(row.delivery_fee_cents),
    totalInCents: centsFrom(row.total_cents),
    currency: row.currency,
    status: row.status,
    installments: row.installments,
    cardBrand: row.card_brand,
    cardLast4: row.card_last4,
    providerTransactionId: row.provider_transaction_id,
    providerStatusMessage: row.provider_status_message,
    reservationExpiresAt: row.reservation_expires_at,
    finalizedAt: row.finalized_at,
    emailSentAt: row.email_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
