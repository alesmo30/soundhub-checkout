import type { Cents } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import { DomainError } from '../../../shared/domain/domain-error';

export function missingIdempotencyKey(): DomainError {
  return new DomainError(
    ErrorCode.MISSING_IDEMPOTENCY_KEY,
    'VALIDATION',
    'Idempotency-Key header is required and must be a UUID v4',
  );
}

export function idempotencyKeyReused(): DomainError {
  return new DomainError(
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
    'UNPROCESSABLE',
    'Idempotency-Key was already used with a different request body',
  );
}

export function priceChanged(expected: Cents, actual: Cents): DomainError {
  return new DomainError(
    ErrorCode.PRICE_CHANGED,
    'CONFLICT',
    `Expected total ${expected} does not match the current quote total ${actual}`,
  );
}

export function outOfStockOnReserve(): DomainError {
  return new DomainError(ErrorCode.OUT_OF_STOCK, 'CONFLICT', 'Not enough stock to reserve');
}

export function customerNotFoundForPayment(): DomainError {
  return new DomainError(ErrorCode.CUSTOMER_NOT_FOUND, 'UNPROCESSABLE', 'Customer not found');
}

export function paymentGatewayUnavailable(): DomainError {
  return new DomainError(
    ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,
    'UNAVAILABLE',
    'The payment gateway is temporarily unavailable',
  );
}

export function transactionNotFound(id: string): DomainError {
  return new DomainError(
    ErrorCode.TRANSACTION_NOT_FOUND,
    'NOT_FOUND',
    `Transaction ${id} not found`,
  );
}
