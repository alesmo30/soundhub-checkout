/* eslint-disable unicorn/filename-case -- __fixtures__ is the spec's required directory name (specs/12b-api-email-notifications.md). */
import type { TransactionEmailData } from '../render-transaction-email';

// The customer's PII, kept separate from TransactionEmailData (which never
// carries it) so specs can assert these exact strings never reach an email
// (see acceptance criteria > Templates).
export const SAMPLE_CUSTOMER_PII = {
  documentNumber: '1234567890',
  email: 'ana.gomez@example.com',
  phone: '+57 300 555 1234',
} as const;

export const SAMPLE_DELIVERY_ADDRESS = 'Calle 10 # 20-30, Bogotá, Colombia' as const;

export const SAMPLE_LINKS = {
  orderUrl: 'http://localhost:5173/transactions/7f3c1a2e-1111-4b11-8b11-000000000000',
  retryUrl: 'http://localhost:5173/products/9c2b1a3d-2222-4c22-9c22-000000000000',
};

export function buildSampleEmailData(
  overrides: Partial<TransactionEmailData> = {},
): TransactionEmailData {
  return {
    status: 'APPROVED',
    firstName: 'Ana',
    reference: 'TX-2026-000123',
    productName: 'Audífonos Bluetooth con cancelación de ruido',
    quantity: 2,
    // Matches the spec's worked example: 392046000 cents -> "$ 3.920.460".
    amounts: {
      subtotalInCents: 350_000_000,
      baseFeeInCents: 30_000_000,
      deliveryFeeInCents: 12_046_000,
      totalInCents: 392_046_000,
    },
    card: { brand: 'VISA', last4: '4242' },
    deliveryStatus: 'READY_TO_SHIP',
    links: SAMPLE_LINKS,
    ...overrides,
  };
}
