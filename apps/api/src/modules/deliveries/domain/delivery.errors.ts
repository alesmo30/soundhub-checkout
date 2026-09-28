import { ErrorCode } from '@checkout/shared/enums';

import { DomainError } from '../../../shared/domain/domain-error';

export function deliveryNotFound(id: string): DomainError {
  return new DomainError(ErrorCode.DELIVERY_NOT_FOUND, 'NOT_FOUND', `Delivery ${id} not found`);
}
