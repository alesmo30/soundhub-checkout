import type { ResultAsync } from 'neverthrow';

import type { DomainError } from '../../domain/domain-error';
import { DomainErrorException } from './domain-error.exception';

export async function respond<T>(result: ResultAsync<T, DomainError>): Promise<{ data: T }> {
  const outcome = await result;

  return outcome.match(
    (value) => ({ data: value }),
    (error) => {
      throw new DomainErrorException(error);
    },
  );
}
