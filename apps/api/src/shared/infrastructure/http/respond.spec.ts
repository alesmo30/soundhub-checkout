import { ErrorCode } from '@checkout/shared/enums';
import { okAsync } from 'neverthrow';

import { DomainError } from '../../domain/domain-error';
import { errAsync } from '../../domain/result';
import { DomainErrorException } from './domain-error.exception';
import { respond } from './respond';

describe('respond', () => {
  it('unwraps an Ok result into { data }', async () => {
    const body = await respond(okAsync({ id: '1' }));

    expect(body).toEqual({ data: { id: '1' } });
  });

  it('throws a DomainErrorException wrapping the DomainError on Err', async () => {
    const error = new DomainError(ErrorCode.PRODUCT_NOT_FOUND, 'NOT_FOUND', 'Product not found.');

    await expect(respond(errAsync(error))).rejects.toThrow(DomainErrorException);
    await respond(errAsync(error)).catch((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(DomainErrorException);
      expect((thrown as DomainErrorException).domainError).toBe(error);
    });
  });
});
