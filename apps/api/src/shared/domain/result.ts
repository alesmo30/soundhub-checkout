import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow';

import type { DomainError } from './domain-error';

export type DomainResult<T> = Result<T, DomainError>;
export type DomainResultAsync<T> = ResultAsync<T, DomainError>;

export { err, errAsync, ok, okAsync, Result, ResultAsync };
