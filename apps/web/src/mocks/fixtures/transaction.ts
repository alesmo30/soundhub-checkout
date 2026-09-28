import type { TransactionCreated, TransactionView } from '@checkout/shared/contracts';
import { CURRENCY } from '@checkout/shared/constants';
import { CardBrand, DeliveryStatus, TransactionStatus } from '@checkout/shared/enums';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111101';
const DELIVERY_ID = '55555555-5555-4555-8555-555555555501';

interface TransactionViewOverrides {
  id: string;
  status: TransactionStatus;
  finalizedAt: string | null;
  last4?: string;
}

function buildTransactionView({
  id,
  status,
  finalizedAt,
  last4 = '4242',
}: TransactionViewOverrides): TransactionView {
  return {
    id,
    reference: `TX-20260926-${id.slice(-6).toUpperCase()}`,
    status,
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
    card: { brand: CardBrand.VISA, last4 },
    delivery: { id: DELIVERY_ID, status: DeliveryStatus.READY_TO_SHIP },
    createdAt: '2026-09-26T15:04:05Z',
    finalizedAt,
  };
}

function buildTransactionCreated(view: TransactionView): TransactionCreated {
  return {
    id: view.id,
    reference: view.reference,
    status: view.status,
    statusMessage: view.statusMessage,
    totalInCents: view.amounts.totalInCents,
    currency: view.amounts.currency,
    delivery: view.delivery,
    createdAt: view.createdAt,
  };
}

// One fixed-id fixture per final status, plus an endless PENDING one, for
// direct GET /transactions/:id lookups (see the MSW table in
// specs/11-web-payment.md#msw-dev-and-tests).
export const transactionApprovedFixture = buildTransactionView({
  id: '44444444-4444-4444-8444-444444444401',
  status: TransactionStatus.APPROVED,
  finalizedAt: '2026-09-26T15:05:10Z',
});

export const transactionDeclinedFixture = buildTransactionView({
  id: '44444444-4444-4444-8444-444444444402',
  status: TransactionStatus.DECLINED,
  finalizedAt: '2026-09-26T15:05:10Z',
});

export const transactionErrorFixture = buildTransactionView({
  id: '44444444-4444-4444-8444-444444444403',
  status: TransactionStatus.ERROR,
  finalizedAt: '2026-09-26T15:05:10Z',
});

export const transactionVoidedFixture = buildTransactionView({
  id: '44444444-4444-4444-8444-444444444404',
  status: TransactionStatus.VOIDED,
  finalizedAt: '2026-09-26T15:05:10Z',
});

export const transactionExpiredFixture = buildTransactionView({
  id: '44444444-4444-4444-8444-444444444405',
  status: TransactionStatus.EXPIRED,
  finalizedAt: '2026-09-26T15:05:10Z',
});

// Stays PENDING forever: exercises the polling hook's "under review" window.
export const transactionPendingFixture = buildTransactionView({
  id: '44444444-4444-4444-8444-444444444406',
  status: TransactionStatus.PENDING,
  finalizedAt: null,
});

export const transactionViewFixturesById: Record<string, TransactionView> = {
  [transactionApprovedFixture.id]: transactionApprovedFixture,
  [transactionDeclinedFixture.id]: transactionDeclinedFixture,
  [transactionErrorFixture.id]: transactionErrorFixture,
  [transactionVoidedFixture.id]: transactionVoidedFixture,
  [transactionExpiredFixture.id]: transactionExpiredFixture,
  [transactionPendingFixture.id]: transactionPendingFixture,
};

// "Progressing" transactions: PENDING on the first two GETs, then a final
// status, per card token (4242 → APPROVED, 4111 → DECLINED).
export const transactionProgressingId = '44444444-4444-4444-8444-444444444407';
export const transactionDeclinedProgressingId = '44444444-4444-4444-8444-444444444408';

export const transactionProgressingPendingFixture = buildTransactionView({
  id: transactionProgressingId,
  status: TransactionStatus.PENDING,
  finalizedAt: null,
});

export const transactionProgressingApprovedFixture = buildTransactionView({
  id: transactionProgressingId,
  status: TransactionStatus.APPROVED,
  finalizedAt: '2026-09-26T15:05:10Z',
});

export const transactionDeclinedProgressingPendingFixture = buildTransactionView({
  id: transactionDeclinedProgressingId,
  status: TransactionStatus.PENDING,
  finalizedAt: null,
  last4: '1111',
});

export const transactionDeclinedProgressingFixture = buildTransactionView({
  id: transactionDeclinedProgressingId,
  status: TransactionStatus.DECLINED,
  finalizedAt: '2026-09-26T15:05:10Z',
  last4: '1111',
});

// What POST /transactions returns right away, before the status progresses.
export const transactionCreatedProgressingFixture = buildTransactionCreated(
  transactionProgressingPendingFixture,
);
export const transactionCreatedDeclinedProgressingFixture = buildTransactionCreated(
  transactionDeclinedProgressingPendingFixture,
);
