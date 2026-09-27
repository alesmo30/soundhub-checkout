import type { ResultAsync } from '../../domain/result';

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface TxContext {
  readonly __brand: 'TxContext';
}

export interface UnitOfWork {
  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E>;
}
