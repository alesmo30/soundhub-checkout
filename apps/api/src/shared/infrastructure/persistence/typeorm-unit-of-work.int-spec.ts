import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager } from 'typeorm';

import type { TxContext } from '../../application/ports/unit-of-work.port';
import { errAsync, ResultAsync } from '../../domain/result';
import dataSource from './data-source';
import { TypeOrmTxContext } from './typeorm-tx-context';
import { TypeOrmUnitOfWork } from './typeorm-unit-of-work';

function managerOf(tx: TxContext): EntityManager {
  if (!(tx instanceof TypeOrmTxContext)) {
    throw new Error('Expected a TypeOrmTxContext');
  }

  return tx.manager;
}

function randomCustomerRow(): {
  documentNumber: string;
  email: string;
  fullName: string;
  phone: string;
} {
  const documentNumber = String(1_000_000 + Math.floor(Math.random() * 8_999_999));
  const phoneSuffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');

  return {
    documentNumber,
    email: `${randomUUID()}@example.com`,
    fullName: 'Integration Test',
    phone: `3${phoneSuffix}`,
  };
}

async function insertCustomer(
  manager: EntityManager,
  row: ReturnType<typeof randomCustomerRow>,
): Promise<void> {
  await manager.query(
    `INSERT INTO customers (document_number, email, full_name, phone) VALUES ($1, $2, $3, $4)`,
    [row.documentNumber, row.email, row.fullName, row.phone],
  );
}

async function countCustomer(source: DataSource, documentNumber: string): Promise<number> {
  const rows: Array<{ count: string }> = await source.query(
    `SELECT COUNT(*) AS count FROM customers WHERE document_number = $1`,
    [documentNumber],
  );

  return Number(rows[0]?.count ?? 0);
}

describe('TypeOrmUnitOfWork', () => {
  let unitOfWork: TypeOrmUnitOfWork;

  beforeAll(async () => {
    await dataSource.initialize();
    unitOfWork = new TypeOrmUnitOfWork(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('commits the transaction when work resolves Ok', async () => {
    const row = randomCustomerRow();

    const result = await unitOfWork.run((tx) =>
      ResultAsync.fromSafePromise(insertCustomer(managerOf(tx), row)),
    );

    expect(result.isOk()).toBe(true);
    expect(await countCustomer(dataSource, row.documentNumber)).toBe(1);
  });

  it('rolls back the transaction when work resolves Err', async () => {
    const row = randomCustomerRow();

    const result = await unitOfWork.run((tx) =>
      ResultAsync.fromSafePromise(insertCustomer(managerOf(tx), row)).andThen(() =>
        errAsync('boom' as const),
      ),
    );

    expect(result.isErr()).toBe(true);
    expect(await countCustomer(dataSource, row.documentNumber)).toBe(0);
  });

  it('rolls back and rejects when work throws unexpectedly', async () => {
    const row = randomCustomerRow();

    await expect(
      unitOfWork.run((tx) => {
        const rejected = insertCustomer(managerOf(tx), row).then((): never => {
          throw new Error('infrastructure failure');
        });

        return new ResultAsync(rejected);
      }),
    ).rejects.toThrow('infrastructure failure');
    expect(await countCustomer(dataSource, row.documentNumber)).toBe(0);
  });

  it('never mixes up two concurrent Ok results with each other', async () => {
    const rowA = randomCustomerRow();
    const rowB = randomCustomerRow();

    const [resultA, resultB] = await Promise.all([
      unitOfWork.run((tx) =>
        ResultAsync.fromSafePromise(insertCustomer(managerOf(tx), rowA)).map(() => 'A'),
      ),
      unitOfWork.run((tx) =>
        ResultAsync.fromSafePromise(insertCustomer(managerOf(tx), rowB)).map(() => 'B'),
      ),
    ]);

    expect(resultA._unsafeUnwrap()).toBe('A');
    expect(resultB._unsafeUnwrap()).toBe('B');
    expect(await countCustomer(dataSource, rowA.documentNumber)).toBe(1);
    expect(await countCustomer(dataSource, rowB.documentNumber)).toBe(1);
  });
});
