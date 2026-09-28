import { ErrorCode } from '@checkout/shared/enums';

import { deliveryNotFound } from './delivery.errors';

describe('deliveryNotFound', () => {
  it('builds a NOT_FOUND domain error carrying the id', () => {
    const error = deliveryNotFound('delivery-1');

    expect(error.code).toBe(ErrorCode.DELIVERY_NOT_FOUND);
    expect(error.kind).toBe('NOT_FOUND');
    expect(error.detail).toContain('delivery-1');
  });
});
