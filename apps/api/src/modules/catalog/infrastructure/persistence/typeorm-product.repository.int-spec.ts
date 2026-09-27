import { randomUUID } from 'node:crypto';

import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import { ProductOrmEntity } from './product.orm-entity';
import { TypeOrmProductRepository } from './typeorm-product.repository';

function buildProductRow(overrides: Partial<ProductOrmEntity> = {}): Partial<ProductOrmEntity> {
  return {
    sku: overrides.sku ?? `TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: overrides.name ?? 'Integration Test Product',
    brand: overrides.brand ?? 'Test Brand',
    description: overrides.description ?? 'Integration test description',
    priceCents: overrides.priceCents ?? 100_000,
    imageUrl: overrides.imageUrl ?? '/images/products/test-640.webp',
    stockAvailable: overrides.stockAvailable ?? 10,
    stockReserved: overrides.stockReserved ?? 0,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

function insertProduct(
  manager: EntityManager,
  overrides: Partial<ProductOrmEntity> = {},
): Promise<ProductOrmEntity> {
  return manager.getRepository(ProductOrmEntity).save(buildProductRow(overrides));
}

// Dates far enough in the past that no seeded or previously-run fixture row
// (all created with `DEFAULT now()`) can ever sort before them, so ordering
// assertions do not depend on the table being otherwise empty.
const T0 = new Date('1998-01-01T00:00:00.000Z');
const T1 = new Date('1998-01-02T00:00:00.000Z');
const T2 = new Date('1998-01-03T00:00:00.000Z');

describe('TypeOrmProductRepository', () => {
  let queryRunner: QueryRunner;
  let repository: TypeOrmProductRepository;

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    repository = new TypeOrmProductRepository(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  it('orders findPage by (created_at, id), breaking a created_at tie by id', async () => {
    const older = await insertProduct(queryRunner.manager, { createdAt: T0 });
    const tieA = await insertProduct(queryRunner.manager, { createdAt: T1 });
    const tieB = await insertProduct(queryRunner.manager, { createdAt: T1 });
    const newer = await insertProduct(queryRunner.manager, { createdAt: T2 });
    const [firstTie, secondTie] = tieA.id < tieB.id ? [tieA, tieB] : [tieB, tieA];

    const result = await repository.findPage({ page: 1, limit: 10 });
    const ids = result._unsafeUnwrap().items.map((item) => item.id);

    expect(ids.slice(0, 4)).toEqual([older.id, firstTie.id, secondTie.id, newer.id]);
  });

  it('paginates with skip/take and reports totalItems from findAndCount', async () => {
    const limit = 2;
    const totalBefore = await queryRunner.manager.count(ProductOrmEntity);
    // Sequential, not Promise.all: a QueryRunner holds one dedicated
    // connection, and node-postgres does not allow overlapping queries on
    // the same client. Four rows fill exactly two full pages of `limit`,
    // so neither page's item count depends on how many other (real) rows
    // the local catalog happens to hold.
    const rows: ProductOrmEntity[] = [];
    for (const offsetSeconds of [0, 1, 2, 3]) {
      rows.push(
        await insertProduct(queryRunner.manager, {
          createdAt: new Date(T0.getTime() + offsetSeconds * 1000),
        }),
      );
    }
    const totalAfter = totalBefore + rows.length;

    const firstPage = (await repository.findPage({ page: 1, limit }))._unsafeUnwrap();
    expect(firstPage.items.map((item) => item.id)).toEqual([rows[0]?.id, rows[1]?.id]);
    expect(firstPage.totalItems).toBe(totalAfter);

    const secondPage = (await repository.findPage({ page: 2, limit }))._unsafeUnwrap();
    expect(secondPage.items.map((item) => item.id)).toEqual([rows[2]?.id, rows[3]?.id]);
    expect(secondPage.totalItems).toBe(totalAfter);

    const pastTheEndPage = Math.ceil(totalAfter / limit) + 1;
    const emptyPage = (await repository.findPage({ page: pastTheEndPage, limit }))._unsafeUnwrap();
    expect(emptyPage.items).toEqual([]);
    expect(emptyPage.totalItems).toBe(totalAfter);
  });

  it('excludes soft-deleted rows from findPage and findById', async () => {
    const kept = await insertProduct(queryRunner.manager, { createdAt: T0 });
    const deleted = await insertProduct(queryRunner.manager, { createdAt: T0 });
    await queryRunner.manager.getRepository(ProductOrmEntity).softDelete(deleted.id);

    const page = (await repository.findPage({ page: 1, limit: 50 }))._unsafeUnwrap();
    const ids = page.items.map((item) => item.id);
    expect(ids).toContain(kept.id);
    expect(ids).not.toContain(deleted.id);

    expect((await repository.findById(kept.id))._unsafeUnwrap()).not.toBeNull();
    expect((await repository.findById(deleted.id))._unsafeUnwrap()).toBeNull();
  });

  it('findById returns null for an unknown id', async () => {
    const result = await repository.findById(randomUUID());

    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('findById(id, tx) sees a row inserted in that same tx', async () => {
    const outerRepository = new TypeOrmProductRepository(dataSource.manager);
    const fixture = await insertProduct(queryRunner.manager, { createdAt: T0 });
    const tx = new TypeOrmTxContext(queryRunner.manager);

    const withoutTx = (await outerRepository.findById(fixture.id))._unsafeUnwrap();
    expect(withoutTx).toBeNull();

    const withTx = (await outerRepository.findById(fixture.id, tx))._unsafeUnwrap();
    expect(withTx?.id).toBe(fixture.id);
  });
});
