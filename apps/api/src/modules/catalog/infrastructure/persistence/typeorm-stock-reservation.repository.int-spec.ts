import { randomUUID } from 'node:crypto';

import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import { ProductOrmEntity } from './product.orm-entity';
import { TypeOrmStockReservationRepository } from './typeorm-stock-reservation.repository';

function buildProductRow(overrides: Partial<ProductOrmEntity> = {}): Partial<ProductOrmEntity> {
  return {
    sku: overrides.sku ?? `TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: overrides.name ?? 'Stock Reservation Test Product',
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

function loadProduct(manager: EntityManager, id: string): Promise<ProductOrmEntity | null> {
  // withDeleted: the soft-deleted-product scenario needs to read the row
  // back to assert stock was left untouched.
  return manager.getRepository(ProductOrmEntity).findOne({ where: { id }, withDeleted: true });
}

describe('TypeOrmStockReservationRepository', () => {
  let queryRunner: QueryRunner;
  let repository: TypeOrmStockReservationRepository;
  let tx: TypeOrmTxContext;

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
    repository = new TypeOrmStockReservationRepository(queryRunner.manager);
    tx = new TypeOrmTxContext(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  describe('reserve', () => {
    it('moves available − q, reserved + q and returns RESERVED', async () => {
      const product = await insertProduct(queryRunner.manager, {
        stockAvailable: 10,
        stockReserved: 2,
      });

      const result = await repository.reserve(tx, { productId: product.id, quantity: 3 });

      expect(result._unsafeUnwrap()).toBe('RESERVED');
      const row = await loadProduct(queryRunner.manager, product.id);
      expect(row?.stockAvailable).toBe(7);
      expect(row?.stockReserved).toBe(5);
    });

    it('returns INSUFFICIENT_STOCK and changes nothing when the request exceeds available stock', async () => {
      const product = await insertProduct(queryRunner.manager, {
        stockAvailable: 2,
        stockReserved: 1,
      });

      const result = await repository.reserve(tx, { productId: product.id, quantity: 3 });

      expect(result._unsafeUnwrap()).toBe('INSUFFICIENT_STOCK');
      const row = await loadProduct(queryRunner.manager, product.id);
      expect(row?.stockAvailable).toBe(2);
      expect(row?.stockReserved).toBe(1);
    });

    it('returns INSUFFICIENT_STOCK for a soft-deleted product', async () => {
      const product = await insertProduct(queryRunner.manager, {
        stockAvailable: 10,
        stockReserved: 0,
      });
      await queryRunner.manager.getRepository(ProductOrmEntity).softDelete(product.id);

      const result = await repository.reserve(tx, { productId: product.id, quantity: 1 });

      expect(result._unsafeUnwrap()).toBe('INSUFFICIENT_STOCK');
      const row = await loadProduct(queryRunner.manager, product.id);
      expect(row?.stockAvailable).toBe(10);
      expect(row?.stockReserved).toBe(0);
    });
  });

  describe('release', () => {
    it('restores both stock_available and stock_reserved', async () => {
      const product = await insertProduct(queryRunner.manager, {
        stockAvailable: 5,
        stockReserved: 4,
      });

      const result = await repository.release(tx, { productId: product.id, quantity: 4 });

      expect(result.isOk()).toBe(true);
      const row = await loadProduct(queryRunner.manager, product.id);
      expect(row?.stockAvailable).toBe(9);
      expect(row?.stockReserved).toBe(0);
    });
  });

  describe('commit', () => {
    it('only lowers stock_reserved, leaving stock_available untouched', async () => {
      const product = await insertProduct(queryRunner.manager, {
        stockAvailable: 6,
        stockReserved: 4,
      });

      const result = await repository.commit(tx, { productId: product.id, quantity: 4 });

      expect(result.isOk()).toBe(true);
      const row = await loadProduct(queryRunner.manager, product.id);
      expect(row?.stockAvailable).toBe(6);
      expect(row?.stockReserved).toBe(0);
    });
  });
});
