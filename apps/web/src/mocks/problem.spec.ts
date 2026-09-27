import { ErrorCode } from '@checkout/shared/enums';

import { problem } from './problem';

describe('problem', () => {
  it('builds a ProblemDetails object from status, code and detail', () => {
    const result = problem(404, ErrorCode.PRODUCT_NOT_FOUND, 'Product not found');

    expect(result.status).toBe(404);
    expect(result.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
    expect(result.detail).toBe('Product not found');
    expect(result.traceId).toEqual(expect.any(String));
  });
});
