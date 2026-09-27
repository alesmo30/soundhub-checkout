import type { EntityManager } from 'typeorm';

import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import { TypeOrmProductRepository } from './typeorm-product.repository';
import type { ProductOrmEntity } from './product.orm-entity';

function buildEntity(overrides: Partial<ProductOrmEntity> = {}): ProductOrmEntity {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    sku: 'HP-SNY-WH1000XM5',
    name: 'Sony WH-1000XM5',
    brand: 'Sony',
    description: 'Noise cancelling headphones',
    priceCents: 189_990_000,
    imageUrl: '/images/products/hp-sny-wh1000xm5-640.webp',
    stockAvailable: 7,
    stockReserved: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildManager(overrides: Partial<EntityManager> = {}): EntityManager {
  return {
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    ...overrides,
  } as unknown as EntityManager;
}

describe('TypeOrmProductRepository', () => {
  describe('findPage', () => {
    it('orders by (created_at, id) and applies skip/take from the requested page', async () => {
      const entity = buildEntity();
      const findAndCount = jest.fn().mockResolvedValue([[entity], 1]);
      const repository = new TypeOrmProductRepository(buildManager({ findAndCount }));

      const result = await repository.findPage({ page: 2, limit: 5 });

      expect(findAndCount).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          order: { createdAt: 'ASC', id: 'ASC' },
          skip: 5,
          take: 5,
        }),
      );
      const page = result._unsafeUnwrap();
      expect(page.totalItems).toBe(1);
      expect(page.items).toEqual([
        expect.objectContaining({ id: entity.id, priceInCents: entity.priceCents }),
      ]);
    });
  });

  describe('findById', () => {
    it('uses its own manager and maps the entity when found', async () => {
      const entity = buildEntity();
      const findOne = jest.fn().mockResolvedValue(entity);
      const repository = new TypeOrmProductRepository(buildManager({ findOne }));

      const result = await repository.findById(entity.id);

      expect(findOne).toHaveBeenCalledWith(expect.anything(), { where: { id: entity.id } });
      expect(result._unsafeUnwrap()).toEqual(expect.objectContaining({ id: entity.id }));
    });

    it('returns null when no entity matches', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const repository = new TypeOrmProductRepository(buildManager({ findOne }));

      const result = await repository.findById('unknown-id');

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('uses the tx manager instead of its own when a TypeOrmTxContext is given', async () => {
      const entity = buildEntity();
      const ownFindOne = jest.fn().mockResolvedValue(null);
      const txFindOne = jest.fn().mockResolvedValue(entity);
      const repository = new TypeOrmProductRepository(buildManager({ findOne: ownFindOne }));
      const tx = new TypeOrmTxContext(buildManager({ findOne: txFindOne }));

      const result = await repository.findById(entity.id, tx);

      expect(txFindOne).toHaveBeenCalled();
      expect(ownFindOne).not.toHaveBeenCalled();
      expect(result._unsafeUnwrap()).toEqual(expect.objectContaining({ id: entity.id }));
    });
  });
});
