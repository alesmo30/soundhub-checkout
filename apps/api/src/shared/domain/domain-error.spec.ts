import { ErrorCode } from '@checkout/shared/enums';

import { DomainError } from './domain-error';

describe('DomainError', () => {
  it('carries code, kind and detail as readonly fields', () => {
    const error = new DomainError(ErrorCode.PRODUCT_NOT_FOUND, 'NOT_FOUND', 'Product not found');

    expect(error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
    expect(error.kind).toBe('NOT_FOUND');
    expect(error.detail).toBe('Product not found');
  });

  it('lets the same code carry a different kind for a different use case', () => {
    const notFound = new DomainError(ErrorCode.PRODUCT_NOT_FOUND, 'NOT_FOUND', 'on a path param');
    const unprocessable = new DomainError(
      ErrorCode.PRODUCT_NOT_FOUND,
      'UNPROCESSABLE',
      'in a quote body',
    );

    expect(notFound.kind).not.toBe(unprocessable.kind);
    expect(notFound.code).toBe(unprocessable.code);
  });
});
