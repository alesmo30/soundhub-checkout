import type { Paginated } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import { okAsync } from 'neverthrow';

import { DomainError } from '../../domain/domain-error';
import { errAsync } from '../../domain/result';
import { DomainErrorException } from './domain-error.exception';
import { respond, respondPaginated } from './respond';

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

describe('respondPaginated', () => {
  it('returns the Ok value as-is, already shaped as { data, meta }', async () => {
    const page: Paginated<{ id: string }> = {
      data: [{ id: '1' }],
      meta: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
    };

    const body = await respondPaginated(okAsync(page));

    expect(body).toEqual(page);
  });

  it('throws a DomainErrorException wrapping the DomainError on Err', async () => {
    const error = new DomainError(ErrorCode.PRODUCT_NOT_FOUND, 'NOT_FOUND', 'Product not found.');

    await expect(respondPaginated(errAsync(error))).rejects.toThrow(DomainErrorException);
    await respondPaginated(errAsync(error)).catch((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(DomainErrorException);
      expect((thrown as DomainErrorException).domainError).toBe(error);
    });
  });
});
