import type { DataSource, EntityManager } from 'typeorm';

import { errAsync, okAsync } from '../../domain/result';
import { TypeOrmUnitOfWork } from './typeorm-unit-of-work';

function fakeDataSource(): DataSource {
  return {
    transaction: async (work: (manager: EntityManager) => Promise<unknown>) =>
      work({} as EntityManager),
  } as unknown as DataSource;
}

describe('TypeOrmUnitOfWork', () => {
  it('resolves Ok when work resolves Ok', async () => {
    const unitOfWork = new TypeOrmUnitOfWork(fakeDataSource());

    const result = await unitOfWork.run(() => okAsync('value'));

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('value');
  });

  it('resolves Err (after forcing the transaction to reject) when work resolves Err', async () => {
    const unitOfWork = new TypeOrmUnitOfWork(fakeDataSource());

    const result = await unitOfWork.run(() => errAsync('boom'));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe('boom');
  });

  it('rejects, rather than becoming an Err, when work throws unexpectedly', async () => {
    const unitOfWork = new TypeOrmUnitOfWork(fakeDataSource());

    await expect(
      unitOfWork.run(() => {
        throw new Error('infrastructure failure');
      }),
    ).rejects.toThrow('infrastructure failure');
  });
});
