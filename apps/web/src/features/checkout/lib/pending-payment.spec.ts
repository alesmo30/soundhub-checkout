import type { CreateTransactionRequest } from '@checkout/shared/contracts';

import {
  clearPendingPayment,
  PENDING_PAYMENT_KEY,
  readPendingPayment,
  writePendingPayment,
  type PendingPayment,
} from './pending-payment';

const BODY: CreateTransactionRequest = {
  customerId: 'customer-1',
  productId: 'product-1',
  quantity: 2,
  installments: 1,
  expectedTotalInCents: 392046000,
  payment: {
    cardToken: 'tok_test_123',
    cardBrand: 'VISA',
    cardLast4: '4242',
    acceptanceToken: 'test-acceptance-token',
    personalAuthToken: 'test-personal-data-token',
  },
  delivery: {
    recipientName: 'Ada Lovelace',
    phone: '3001234567',
    addressLine: 'Calle 1 # 2-3',
    municipalityCode: '05001',
  },
};

const ENTRY: PendingPayment = {
  idempotencyKey: 'a1a1a1a1-0000-4000-8000-000000000000',
  body: BODY,
  savedAt: '2026-09-27T10:00:00.000Z',
};

afterEach(() => {
  sessionStorage.clear();
  jest.restoreAllMocks();
});

describe('writePendingPayment / readPendingPayment', () => {
  it('round-trips the entry through sessionStorage', () => {
    writePendingPayment(ENTRY);

    expect(readPendingPayment()).toEqual(ENTRY);
    expect(sessionStorage.getItem(PENDING_PAYMENT_KEY)).toBe(JSON.stringify(ENTRY));
  });

  it('returns null when nothing was written', () => {
    expect(readPendingPayment()).toBeNull();
  });
});

describe('clearPendingPayment', () => {
  it('removes the stored entry', () => {
    writePendingPayment(ENTRY);
    clearPendingPayment();

    expect(readPendingPayment()).toBeNull();
  });
});

describe('a malformed entry', () => {
  it('is cleared and read as null when the JSON is invalid', () => {
    sessionStorage.setItem(PENDING_PAYMENT_KEY, '{not json');

    expect(readPendingPayment()).toBeNull();
    expect(sessionStorage.getItem(PENDING_PAYMENT_KEY)).toBeNull();
  });

  it('is cleared and read as null when the shape is wrong', () => {
    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ foo: 'bar' }));

    expect(readPendingPayment()).toBeNull();
    expect(sessionStorage.getItem(PENDING_PAYMENT_KEY)).toBeNull();
  });

  it('is cleared and read as null when body is missing', () => {
    sessionStorage.setItem(
      PENDING_PAYMENT_KEY,
      JSON.stringify({ idempotencyKey: 'a-key', savedAt: '2026-09-27T10:00:00.000Z' }),
    );

    expect(readPendingPayment()).toBeNull();
    expect(sessionStorage.getItem(PENDING_PAYMENT_KEY)).toBeNull();
  });
});

describe('a throwing storage', () => {
  it('behaves as "no entry" on read', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(readPendingPayment()).toBeNull();
  });

  it('does not throw on write', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => writePendingPayment(ENTRY)).not.toThrow();
  });

  it('does not throw on clear', () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => clearPendingPayment()).not.toThrow();
  });
});
