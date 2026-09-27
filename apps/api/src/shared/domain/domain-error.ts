import type { ErrorCode } from '@checkout/shared/enums';

export type ErrorKind =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'UNAUTHORIZED';

export class DomainError {
  constructor(
    readonly code: ErrorCode,
    readonly kind: ErrorKind,
    readonly detail: string,
  ) {}
}
