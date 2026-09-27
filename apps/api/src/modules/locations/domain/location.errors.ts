import { ErrorCode } from '@checkout/shared/enums';

import { DomainError } from '../../../shared/domain/domain-error';

export function departmentNotFound(code: string): DomainError {
  return new DomainError(
    ErrorCode.DEPARTMENT_NOT_FOUND,
    'NOT_FOUND',
    `Department ${code} not found`,
  );
}
