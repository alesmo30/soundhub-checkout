import type { Cents, Currency } from './common';
import type { CardBrand, TransactionStatus, DeliveryStatus } from '../enums';

export interface PaymentInput {
  cardToken: string;
  cardBrand: CardBrand;
  cardLast4: string;
  acceptanceToken: string;
  personalAuthToken: string;
}

export interface DeliveryInput {
  recipientName: string;
  phone: string;
  addressLine: string;
  addressDetail?: string;
  municipalityCode: string;
}

export interface CreateTransactionRequest {
  customerId: string;
  productId: string;
  quantity: number;
  installments: number;
  expectedTotalInCents: Cents;
  payment: PaymentInput;
  delivery: DeliveryInput;
}

export interface TransactionCreated {
  id: string;
  reference: string;
  status: TransactionStatus;
  statusMessage: string | null;
  totalInCents: Cents;
  currency: Currency;
  delivery: { id: string; status: DeliveryStatus };
  createdAt: string;
}

export interface TransactionView {
  id: string;
  reference: string;
  status: TransactionStatus;
  statusMessage: string | null;
  product: { id: string; name: string; imageUrl: string };
  quantity: number;
  installments: number;
  amounts: {
    unitPriceInCents: Cents;
    subtotalInCents: Cents;
    baseFeeInCents: Cents;
    deliveryFeeInCents: Cents;
    totalInCents: Cents;
    currency: Currency;
  };
  card: { brand: CardBrand; last4: string };
  delivery: { id: string; status: DeliveryStatus };
  createdAt: string;
  finalizedAt: string | null;
}
