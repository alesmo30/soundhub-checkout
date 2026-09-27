import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import type { TxContext, UnitOfWork } from '../../application/ports/unit-of-work.port';
import { err, ok, Result, ResultAsync } from '../../domain/result';
import { TypeOrmTxContext } from './typeorm-tx-context';

// Internal signal that `work()` returned `Err`, so the transaction's own
// promise rejects and TypeORM rolls back; caught below and converted back
// into a resolved `Err`. Anything else that rejects is re-thrown as-is: an
// infrastructure failure, which must reject the caller's promise, not
// become part of the Result.
class UnitOfWorkRollback<E> extends Error {
  constructor(readonly cause: E) {
    super('UnitOfWork.run rolled back on Err');
  }
}

@Injectable()
export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    const resultPromise: Promise<Result<T, E>> = this.dataSource
      .transaction(async (manager) => {
        const tx = new TypeOrmTxContext(manager);
        const outcome = await work(tx);

        if (outcome.isErr()) {
          throw new UnitOfWorkRollback(outcome.error);
        }

        return outcome.value;
      })
      .then(
        (value) => ok<T, E>(value),
        (caught: unknown) => {
          if (caught instanceof UnitOfWorkRollback) {
            return err<T, E>(caught.cause as E);
          }

          throw caught;
        },
      );

    return new ResultAsync(resultPromise);
  }
}
