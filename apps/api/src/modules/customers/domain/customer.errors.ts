import { ErrorCode } from '@checkout/shared/enums';

import { DomainError } from '../../../shared/domain/domain-error';

// Detail texts stay generic: documentNumber, email and phone are sensitive.
// The logger redacts those keys, but a value interpolated into a message
// string would escape that redaction (see docs/design/01-data-model.md#6).
export function emailAlreadyRegistered(): DomainError {
  return new DomainError(
    ErrorCode.EMAIL_ALREADY_REGISTERED,
    'CONFLICT',
    'Email is already registered to a different customer',
  );
}

export function customerDataMismatch(): DomainError {
  return new DomainError(
    ErrorCode.CUSTOMER_DATA_MISMATCH,
    'CONFLICT',
    'Customer data does not match the existing record for this document',
  );
}

export function customerNotFound(): DomainError {
  return new DomainError(ErrorCode.CUSTOMER_NOT_FOUND, 'NOT_FOUND', 'Customer not found');
}
