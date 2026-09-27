import type { TransactionCreated, TransactionView } from '@checkout/shared/contracts';
import { CURRENCY } from '@checkout/shared/constants';
import { CardBrand, DeliveryStatus, TransactionStatus } from '@checkout/shared/enums';

const TRANSACTION_ID = '44444444-4444-4444-8444-444444444401';
const DELIVERY_ID = '55555555-5555-4555-8555-555555555501';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111101';

export const transactionCreatedFixture: TransactionCreated = {
  id: TRANSACTION_ID,
  reference: 'TX-20260926-8F3K2Q',
  status: TransactionStatus.PENDING,
  statusMessage: null,
  totalInCents: 392_046_000,
  currency: CURRENCY,
  delivery: { id: DELIVERY_ID, status: DeliveryStatus.AWAITING_PAYMENT },
  createdAt: '2026-09-26T15:04:05Z',
};

export const transactionViewFixture: TransactionView = {
  id: TRANSACTION_ID,
  reference: transactionCreatedFixture.reference,
  status: TransactionStatus.APPROVED,
  statusMessage: null,
  product: {
    id: PRODUCT_ID,
    name: 'WH-1000XM5',
    imageUrl: '/images/products/HP-SNY-WH1000XM5-640.webp',
  },
  quantity: 2,
  installments: 1,
  amounts: {
    unitPriceInCents: 189_990_000,
    subtotalInCents: 379_980_000,
    baseFeeInCents: 12_066_000,
    deliveryFeeInCents: 0,
    totalInCents: 392_046_000,
    currency: CURRENCY,
  },
  card: { brand: CardBrand.VISA, last4: '4242' },
  delivery: { id: DELIVERY_ID, status: DeliveryStatus.READY_TO_SHIP },
  createdAt: '2026-09-26T15:04:05Z',
  finalizedAt: '2026-09-26T15:05:10Z',
};
