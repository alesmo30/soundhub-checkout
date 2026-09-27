import { DomainErrorException } from '../../../../shared/infrastructure/http/domain-error.exception';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';

describe('IdempotencyKeyPipe', () => {
  const pipe = new IdempotencyKeyPipe();

  it('returns the value unchanged when it is a uuid v4', () => {
    const value = '11111111-1111-4111-8111-111111111111';

    expect(pipe.transform(value)).toBe(value);
  });

  it('throws MISSING_IDEMPOTENCY_KEY when the header is missing', () => {
    expect(() => pipe.transform(undefined)).toThrow(DomainErrorException);
  });

  it('throws MISSING_IDEMPOTENCY_KEY when the value is not a uuid v4', () => {
    try {
      pipe.transform('not-a-uuid');
      throw new Error('expected transform to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainErrorException);
      expect((error as DomainErrorException).domainError.code).toBe('MISSING_IDEMPOTENCY_KEY');
    }
  });
});
