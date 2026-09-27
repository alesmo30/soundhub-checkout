import type { CardBrand, TransactionStatus } from '@checkout/shared/enums';

import type { Result, ResultAsync } from '../../../../shared/domain/result';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CreateChargeRequest {
  readonly reference: string;
  readonly amountInCents: number;
  readonly customerEmail: string;
  readonly installments: number;
  readonly cardToken: string;
  readonly acceptanceToken: string;
  readonly personalAuthToken: string;
}

export interface GatewayCharge {
  readonly providerTransactionId: string;
  readonly status: Exclude<TransactionStatus, 'EXPIRED'>;
  readonly statusMessage: string | null;
  readonly cardBrand: CardBrand | null;
  readonly cardLast4: string | null;
}

export interface PaymentGatewayError {
  readonly kind: 'UNAVAILABLE' | 'TIMEOUT' | 'REJECTED';
  readonly message: string;
}

export interface PaymentGatewayPort {
  // Backed by a circuit breaker; checked before reserving stock.
  ensureAvailable(): Result<void, PaymentGatewayError>;
  createCharge(request: CreateChargeRequest): ResultAsync<GatewayCharge, PaymentGatewayError>;
  getCharge(providerTransactionId: string): ResultAsync<GatewayCharge, PaymentGatewayError>;
  findChargeByReference(reference: string): ResultAsync<GatewayCharge | null, PaymentGatewayError>;
}
