import { ErrorCode } from '@checkout/shared/enums';

import { productNotFound } from './product.errors';

describe('productNotFound', () => {
  it('builds a NOT_FOUND domain error carrying the id', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    const error = productNotFound(id);

    expect(error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
    expect(error.kind).toBe('NOT_FOUND');
    expect(error.detail).toContain(id);
  });
});
