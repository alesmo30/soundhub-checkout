import { ErrorCode } from '@checkout/shared/enums';

import { DomainError } from './domain-error';
import { err, ok } from './result';
import type { DomainResult } from './result';

describe('Result helpers', () => {
  it('re-exports neverthrow ok/err for a DomainResult', () => {
    const success: DomainResult<number> = ok(42);
    const failure: DomainResult<number> = err(
      new DomainError(ErrorCode.VALIDATION_ERROR, 'VALIDATION', 'bad input'),
    );

    expect(success.isOk()).toBe(true);
    expect(failure.isErr()).toBe(true);
  });
});
