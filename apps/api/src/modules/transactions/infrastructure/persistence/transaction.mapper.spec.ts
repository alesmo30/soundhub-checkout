import type { NewTransaction } from '../../domain/transaction';
import {
  toNewTransactionValues,
  toStockLineFromReturningRow,
  toTransaction,
  toTransactionFromReturningRow,
  type FinalizeReturningRow,
  type TransactionReturningRow,
} from './transaction.mapper';
import type { TransactionOrmEntity } from './transaction.orm-entity';

const RESERVATION_EXPIRES_AT = new Date('2026-09-27T20:05:00.000Z');
const CREATED_AT = new Date('2026-09-27T20:00:00.000Z');
const UPDATED_AT = new Date('2026-09-27T20:00:01.000Z');

function buildOrmEntity(overrides: Partial<TransactionOrmEntity> = {}): TransactionOrmEntity {
  return {
    id: 'tx-1',
    reference: 'TX-20260927-ABC123',
    idempotencyKey: 'idem-1',
    requestHash: '0'.repeat(64),
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 1,
    unitPriceCents: 100_000,
    subtotalCents: 100_000,
    baseFeeCents: 0,
    deliveryFeeCents: 0,
    totalCents: 100_000,
    currency: 'COP',
    status: 'PENDING',
    installments: 1,
    cardBrand: 'VISA',
    cardLast4: '4242',
    providerTransactionId: null,
    providerStatusMessage: null,
    reservationExpiresAt: RESERVATION_EXPIRES_AT,
    finalizedAt: null,
    emailSentAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    deletedAt: null,
    ...overrides,
  };
}

function buildNewTransaction(overrides: Partial<NewTransaction> = {}): NewTransaction {
  return {
    reference: 'TX-20260927-ABC123',
    idempotencyKey: 'idem-1',
    requestHash: '0'.repeat(64),
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 2,
    unitPriceInCents: 100_000,
    subtotalInCents: 200_000,
    baseFeeInCents: 6_000,
    deliveryFeeInCents: 0,
    totalInCents: 206_000,
    currency: 'COP',
    installments: 3,
    cardBrand: 'MASTERCARD',
    cardLast4: '1234',
    reservationExpiresAt: RESERVATION_EXPIRES_AT,
    ...overrides,
  };
}

function buildReturningRow(
  overrides: Partial<TransactionReturningRow> = {},
): TransactionReturningRow {
  return {
    id: 'tx-1',
    reference: 'TX-20260927-ABC123',
    idempotency_key: 'idem-1',
    request_hash: '0'.repeat(64),
    customer_id: 'customer-1',
    product_id: 'product-1',
    quantity: 1,
    unit_price_cents: '100000',
    subtotal_cents: '100000',
    base_fee_cents: '0',
    delivery_fee_cents: '0',
    total_cents: '100000',
    currency: 'COP',
    status: 'PENDING',
    installments: 1,
    card_brand: 'VISA',
    card_last4: '4242',
    provider_transaction_id: null,
    provider_status_message: null,
    reservation_expires_at: RESERVATION_EXPIRES_AT,
    finalized_at: null,
    email_sent_at: null,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    deleted_at: null,
    ...overrides,
  };
}

describe('toTransaction', () => {
  it('maps every ORM entity column to the domain shape, renaming the *Cents fields to *InCents', () => {
    const entity = buildOrmEntity();

    expect(toTransaction(entity)).toEqual({
      id: 'tx-1',
      reference: 'TX-20260927-ABC123',
      idempotencyKey: 'idem-1',
      requestHash: '0'.repeat(64),
      customerId: 'customer-1',
      productId: 'product-1',
      quantity: 1,
      unitPriceInCents: 100_000,
      subtotalInCents: 100_000,
      baseFeeInCents: 0,
      deliveryFeeInCents: 0,
      totalInCents: 100_000,
      currency: 'COP',
      status: 'PENDING',
      installments: 1,
      cardBrand: 'VISA',
      cardLast4: '4242',
      providerTransactionId: null,
      providerStatusMessage: null,
      reservationExpiresAt: RESERVATION_EXPIRES_AT,
      finalizedAt: null,
      emailSentAt: null,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      deletedAt: null,
    });
  });

  it('carries a stored gateway response and finalization through untouched', () => {
    const finalizedAt = new Date('2026-09-27T20:10:00.000Z');
    const entity = buildOrmEntity({
      status: 'ERROR',
      providerTransactionId: 'gw-1',
      providerStatusMessage: 'Declined',
      finalizedAt,
    });

    const result = toTransaction(entity);

    expect(result.status).toBe('ERROR');
    expect(result.providerTransactionId).toBe('gw-1');
    expect(result.providerStatusMessage).toBe('Declined');
    expect(result.finalizedAt).toBe(finalizedAt);
  });
});

describe('toNewTransactionValues', () => {
  it('renames the *InCents domain fields to the ORM entity *Cents columns, dropping DB-assigned columns', () => {
    const values = toNewTransactionValues(buildNewTransaction());

    expect(values).toEqual({
      reference: 'TX-20260927-ABC123',
      idempotencyKey: 'idem-1',
      requestHash: '0'.repeat(64),
      customerId: 'customer-1',
      productId: 'product-1',
      quantity: 2,
      unitPriceCents: 100_000,
      subtotalCents: 200_000,
      baseFeeCents: 6_000,
      deliveryFeeCents: 0,
      totalCents: 206_000,
      currency: 'COP',
      installments: 3,
      cardBrand: 'MASTERCARD',
      cardLast4: '1234',
      reservationExpiresAt: RESERVATION_EXPIRES_AT,
    });
    expect(values).not.toHaveProperty('status');
    expect(values).not.toHaveProperty('providerTransactionId');
  });
});

describe('toStockLineFromReturningRow', () => {
  it('maps the finalize RETURNING row snake_case columns to a StockLine', () => {
    const row: FinalizeReturningRow = { product_id: 'product-9', quantity: 3 };

    expect(toStockLineFromReturningRow(row)).toEqual({ productId: 'product-9', quantity: 3 });
  });
});

describe('toTransactionFromReturningRow', () => {
  it('maps the insert RETURNING row, parsing every bigint money column from string to number', () => {
    const row = buildReturningRow({
      unit_price_cents: '189990000',
      subtotal_cents: '379980000',
      base_fee_cents: '12066000',
      delivery_fee_cents: '0',
      total_cents: '392046000',
    });

    const transaction = toTransactionFromReturningRow(row);

    expect(transaction.unitPriceInCents).toBe(189_990_000);
    expect(transaction.subtotalInCents).toBe(379_980_000);
    expect(transaction.baseFeeInCents).toBe(12_066_000);
    expect(transaction.deliveryFeeInCents).toBe(0);
    expect(transaction.totalInCents).toBe(392_046_000);
    expect(transaction.id).toBe('tx-1');
    expect(transaction.idempotencyKey).toBe('idem-1');
    expect(transaction.requestHash).toBe('0'.repeat(64));
  });

  it('throws if a money column comes back null, which real Postgres never sends for this table', () => {
    const row = buildReturningRow({
      unit_price_cents: null as unknown as string,
    });

    expect(() => toTransactionFromReturningRow(row)).toThrow(
      'Expected a non-null money value, got null',
    );
  });
});
