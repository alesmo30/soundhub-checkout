import { ErrorCode } from '@checkout/shared/enums';

import { DomainError } from '../../../shared/domain/domain-error';

export function productNotFound(id: string): DomainError {
  return new DomainError(ErrorCode.PRODUCT_NOT_FOUND, 'NOT_FOUND', `Product ${id} not found`);
}
