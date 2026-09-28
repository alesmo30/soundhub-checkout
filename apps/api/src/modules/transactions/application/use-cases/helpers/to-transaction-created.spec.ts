import type { Delivery } from '../../../../deliveries';
import type { Transaction } from '../../../domain/transaction';
import { toTransactionCreated } from './to-transaction-created';

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
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
    reservationExpiresAt: new Date('2026-09-27T20:05:00.000Z'),
    finalizedAt: null,
    emailSentAt: null,
    createdAt: new Date('2026-09-27T20:00:00.000Z'),
    updatedAt: new Date('2026-09-27T20:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

const DELIVERY: Delivery = {
  id: 'delivery-1',
  transactionId: 'tx-1',
  status: 'AWAITING_PAYMENT',
} as Delivery;

describe('toTransactionCreated', () => {
  it('renders the TransactionCreated envelope from a transaction and its delivery', () => {
    const transaction = buildTransaction();

    expect(toTransactionCreated(transaction, DELIVERY)).toEqual({
      id: 'tx-1',
      reference: 'TX-20260927-ABC123',
      status: 'PENDING',
      statusMessage: null,
      totalInCents: 100_000,
      currency: 'COP',
      delivery: { id: 'delivery-1', status: 'AWAITING_PAYMENT' },
      createdAt: '2026-09-27T20:00:00.000Z',
    });
  });

  it('carries a non-null statusMessage through for a finalized ERROR transaction', () => {
    const transaction = buildTransaction({ status: 'ERROR', providerStatusMessage: 'Declined' });

    const result = toTransactionCreated(transaction, DELIVERY);

    expect(result.status).toBe('ERROR');
    expect(result.statusMessage).toBe('Declined');
  });

  it('throws when the transaction currency is not the one the schema stores', () => {
    const transaction = buildTransaction({ currency: 'USD' });

    expect(() => toTransactionCreated(transaction, DELIVERY)).toThrow('Unexpected currency USD');
  });
});
