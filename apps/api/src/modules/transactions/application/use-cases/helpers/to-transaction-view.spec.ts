import type { Product } from '../../../../catalog';
import type { Delivery } from '../../../../deliveries';
import type { Transaction } from '../../../domain/transaction';
import { toTransactionView } from './to-transaction-view';

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    reference: 'TX-20260927-ABC123',
    idempotencyKey: 'idem-1',
    requestHash: '0'.repeat(64),
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 2,
    unitPriceInCents: 100_000,
    subtotalInCents: 200_000,
    baseFeeInCents: 5_000,
    deliveryFeeInCents: 10_000,
    totalInCents: 215_000,
    currency: 'COP',
    status: 'APPROVED',
    installments: 3,
    cardBrand: 'VISA',
    cardLast4: '4242',
    providerTransactionId: 'provider-1',
    providerStatusMessage: 'Approved',
    reservationExpiresAt: new Date('2026-09-27T20:05:00.000Z'),
    finalizedAt: new Date('2026-09-27T20:01:00.000Z'),
    emailSentAt: null,
    createdAt: new Date('2026-09-27T20:00:00.000Z'),
    updatedAt: new Date('2026-09-27T20:01:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

const PRODUCT: Product = {
  id: 'product-1',
  sku: 'SKU-1',
  name: 'Headphones',
  brand: 'Acme',
  description: 'Great headphones',
  priceInCents: 100_000,
  imageUrl: 'https://example.com/headphones.png',
  stockAvailable: 8,
  stockReserved: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const DELIVERY: Delivery = {
  id: 'delivery-1',
  transactionId: 'tx-1',
  warehouseId: 'warehouse-1',
  municipalityCode: '05001',
  status: 'READY_TO_SHIP',
  recipientName: 'Jane Doe',
  phone: '3000000000',
  addressLine: 'Calle 1 # 2-3',
  addressDetail: null,
  distanceKm: 5,
  feeRule: 'FREE_METRO',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
};

describe('toTransactionView', () => {
  it('maps a transaction, its product and its delivery to the TransactionView envelope', () => {
    const transaction = buildTransaction();

    const view = toTransactionView({ transaction, product: PRODUCT, delivery: DELIVERY });

    expect(view).toEqual({
      id: 'tx-1',
      reference: 'TX-20260927-ABC123',
      status: 'APPROVED',
      statusMessage: 'Approved',
      product: {
        id: 'product-1',
        name: 'Headphones',
        imageUrl: 'https://example.com/headphones.png',
      },
      quantity: 2,
      installments: 3,
      amounts: {
        unitPriceInCents: 100_000,
        subtotalInCents: 200_000,
        baseFeeInCents: 5_000,
        deliveryFeeInCents: 10_000,
        totalInCents: 215_000,
        currency: 'COP',
      },
      card: { brand: 'VISA', last4: '4242' },
      delivery: { id: 'delivery-1', status: 'READY_TO_SHIP' },
      createdAt: '2026-09-27T20:00:00.000Z',
      finalizedAt: '2026-09-27T20:01:00.000Z',
    });
  });

  it('keeps finalizedAt null for a PENDING transaction', () => {
    const transaction = buildTransaction({ status: 'PENDING', finalizedAt: null });

    const view = toTransactionView({ transaction, product: PRODUCT, delivery: DELIVERY });

    expect(view.finalizedAt).toBeNull();
  });

  it('never carries the customer email or document number, at any depth', () => {
    const transaction = buildTransaction();

    const view = toTransactionView({ transaction, product: PRODUCT, delivery: DELIVERY });

    expect(JSON.stringify(view)).not.toMatch(/email|documentnumber/i);
  });

  it('exposes exactly the TransactionView keys, no more and no less', () => {
    const transaction = buildTransaction();

    const view = toTransactionView({ transaction, product: PRODUCT, delivery: DELIVERY });

    expect(Object.keys(view).sort()).toEqual(
      [
        'id',
        'reference',
        'status',
        'statusMessage',
        'product',
        'quantity',
        'installments',
        'amounts',
        'card',
        'delivery',
        'createdAt',
        'finalizedAt',
      ].sort(),
    );
    expect(Object.keys(view.product).sort()).toEqual(['id', 'name', 'imageUrl'].sort());
    expect(Object.keys(view.amounts).sort()).toEqual(
      [
        'unitPriceInCents',
        'subtotalInCents',
        'baseFeeInCents',
        'deliveryFeeInCents',
        'totalInCents',
        'currency',
      ].sort(),
    );
    expect(Object.keys(view.card).sort()).toEqual(['brand', 'last4'].sort());
    expect(Object.keys(view.delivery).sort()).toEqual(['id', 'status'].sort());
  });

  it('throws for an unexpected currency, never silently mislabeling money', () => {
    const transaction = buildTransaction({ currency: 'USD' });

    expect(() => toTransactionView({ transaction, product: PRODUCT, delivery: DELIVERY })).toThrow(
      'Unexpected currency USD',
    );
  });
});
