import { ErrorCode } from '@checkout/shared/enums';

import type { DomainError, ErrorKind } from '../../domain/domain-error';

const KIND_TO_STATUS: Record<ErrorKind, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
};

const CODE_TO_TITLE: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_ERROR]: 'Validation Error',
  [ErrorCode.MISSING_IDEMPOTENCY_KEY]: 'Missing Idempotency Key',
  [ErrorCode.PRODUCT_NOT_FOUND]: 'Product Not Found',
  [ErrorCode.DEPARTMENT_NOT_FOUND]: 'Department Not Found',
  [ErrorCode.MUNICIPALITY_NOT_FOUND]: 'Municipality Not Found',
  [ErrorCode.CUSTOMER_NOT_FOUND]: 'Customer Not Found',
  [ErrorCode.TRANSACTION_NOT_FOUND]: 'Transaction Not Found',
  [ErrorCode.DELIVERY_NOT_FOUND]: 'Delivery Not Found',
  [ErrorCode.OUT_OF_STOCK]: 'Out Of Stock',
  [ErrorCode.PRICE_CHANGED]: 'Price Changed',
  [ErrorCode.EMAIL_ALREADY_REGISTERED]: 'Email Already Registered',
  [ErrorCode.CUSTOMER_DATA_MISMATCH]: 'Customer Data Mismatch',
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 'Idempotency Key Reused',
  [ErrorCode.RATE_LIMITED]: 'Rate Limited',
  [ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE]: 'Payment Gateway Unavailable',
  [ErrorCode.INVALID_SIGNATURE]: 'Invalid Signature',
  [ErrorCode.INTERNAL_ERROR]: 'Internal Server Error',
};

export class DomainErrorMapper {
  static toHttpStatus(error: DomainError): number {
    return KIND_TO_STATUS[error.kind];
  }

  static toTitle(code: ErrorCode): string {
    return CODE_TO_TITLE[code];
  }
}
