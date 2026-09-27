import { ErrorCode } from '@checkout/shared/enums';

import { DomainError } from '../../../shared/domain/domain-error';

// Pricing has its own 422s: a missing referenced resource is unprocessable
// here, unlike the 404 GET /products/:id returns for the same product.
export function quoteProductNotFound(): DomainError {
  return new DomainError(ErrorCode.PRODUCT_NOT_FOUND, 'UNPROCESSABLE', 'Product not found');
}

export function quoteMunicipalityNotFound(): DomainError {
  return new DomainError(
    ErrorCode.MUNICIPALITY_NOT_FOUND,
    'UNPROCESSABLE',
    'Municipality not found',
  );
}

export function outOfStock(available: number): DomainError {
  return new DomainError(ErrorCode.OUT_OF_STOCK, 'CONFLICT', `Only ${available} units available`);
}
