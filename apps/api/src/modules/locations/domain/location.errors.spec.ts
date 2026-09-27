import { ErrorCode } from '@checkout/shared/enums';

import { departmentNotFound } from './location.errors';

describe('departmentNotFound', () => {
  it('builds a NOT_FOUND domain error carrying the code', () => {
    const code = '99';

    const error = departmentNotFound(code);

    expect(error.code).toBe(ErrorCode.DEPARTMENT_NOT_FOUND);
    expect(error.kind).toBe('NOT_FOUND');
    expect(error.detail).toContain(code);
  });
});
