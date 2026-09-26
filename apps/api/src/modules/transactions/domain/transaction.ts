import type { CardBrand, TransactionStatus } from '@checkout/shared/enums';

export interface Transaction {
  readonly id: string;
  readonly reference: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly customerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceInCents: number;
  readonly subtotalInCents: number;
  readonly baseFeeInCents: number;
  readonly deliveryFeeInCents: number;
  readonly totalInCents: number;
  readonly currency: string;
  readonly status: TransactionStatus;
  readonly installments: number;
  readonly cardBrand: CardBrand;
  readonly cardLast4: string;
  readonly providerTransactionId: string | null;
  readonly providerStatusMessage: string | null;
  readonly reservationExpiresAt: Date;
  readonly finalizedAt: Date | null;
  readonly emailSentAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

// A transaction is never created in a terminal state, and the gateway
// hasn't responded yet, so these are always assigned after insert.
export type NewTransaction = Omit<
  Transaction,
  | 'id'
  | 'status'
  | 'providerTransactionId'
  | 'providerStatusMessage'
  | 'finalizedAt'
  | 'emailSentAt'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
>;

// finalize() moves a transaction out of PENDING into one of these.
export type FinalStatus = Exclude<TransactionStatus, 'PENDING'>;
