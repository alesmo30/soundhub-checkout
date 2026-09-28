import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { loadDbConfig } from '../../../../config/app-config';
import { buildDataSourceOptions } from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmUnitOfWork } from '../../../../shared/infrastructure/persistence/typeorm-unit-of-work';
import type { StockReservationOutcome } from '../../../transactions';
import { ProductOrmEntity } from './product.orm-entity';
import { TypeOrmStockReservationRepository } from './typeorm-stock-reservation.repository';

// The shared `dataSource` singleton (src/shared/infrastructure/persistence/data-source.ts)
// leaves `extra.max` unset, so node-postgres defaults its pool to 10
// connections (see pg-pool's `this.options.max = ... || 10`). 20 attempts
// racing over only 10 connections would queue at the pool instead of truly
// racing at the database, silently hiding an oversell bug behind pool
// serialization. This test opens its own DataSource, scoped to this file
// only, with headroom above the 20 concurrent attempts it fires.
const CONCURRENT_ATTEMPTS = 20;
const POOL_MAX = 25;

const concurrencyDataSource = new DataSource({
  ...buildDataSourceOptions(loadDbConfig()),
  extra: { max: POOL_MAX },
});

function buildTestProductRow(): Partial<ProductOrmEntity> {
  return {
    sku: `TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: 'Stock Reservation Concurrency Test Product',
    brand: 'Test Brand',
    description: 'Integration test description',
    priceCents: 100_000,
    imageUrl: '/images/products/test-640.webp',
    stockAvailable: 1,
    stockReserved: 0,
    createdAt: new Date(),
  };
}

describe('TypeOrmStockReservationRepository concurrency', () => {
  let unitOfWork: TypeOrmUnitOfWork;
  let repository: TypeOrmStockReservationRepository;

  beforeAll(async () => {
    await concurrencyDataSource.initialize();
    unitOfWork = new TypeOrmUnitOfWork(concurrencyDataSource);
    repository = new TypeOrmStockReservationRepository(concurrencyDataSource.manager);
  });

  afterAll(async () => {
    await concurrencyDataSource.destroy();
  });

  it('lets exactly one of 20 parallel reserves win and never oversells', async () => {
    const product = await concurrencyDataSource
      .getRepository(ProductOrmEntity)
      .save(buildTestProductRow());

    try {
      const attempts = Array.from({ length: CONCURRENT_ATTEMPTS }, () =>
        unitOfWork.run((tx) => repository.reserve(tx, { productId: product.id, quantity: 1 })),
      );

      const results = await Promise.all(attempts);
      const outcomes: StockReservationOutcome[] = results.map((result) => result._unsafeUnwrap());

      const reservedCount = outcomes.filter((outcome) => outcome === 'RESERVED').length;
      const insufficientCount = outcomes.filter(
        (outcome) => outcome === 'INSUFFICIENT_STOCK',
      ).length;

      expect(reservedCount).toBe(1);
      expect(insufficientCount).toBe(CONCURRENT_ATTEMPTS - 1);

      const row = await concurrencyDataSource
        .getRepository(ProductOrmEntity)
        .findOneOrFail({ where: { id: product.id } });

      expect(row.stockAvailable).toBe(0);
      expect(row.stockReserved).toBe(1);
    } finally {
      await concurrencyDataSource.getRepository(ProductOrmEntity).softDelete(product.id);
    }
  });
});
