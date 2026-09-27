import type { EntityManager } from 'typeorm';

import type { WarehouseOrmEntity } from './warehouse.orm-entity';
import { TypeOrmWarehouseRepository } from './typeorm-warehouse.repository';

function buildEntity(overrides: Partial<WarehouseOrmEntity> = {}): WarehouseOrmEntity {
  return {
    id: 'b0000000-0000-4000-8000-000000000001',
    name: 'Bodega Medellín',
    municipalityCode: '05001',
    address: 'Cra 50 # 10-20',
    latitude: 6.244203,
    longitude: -75.581212,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildManager(overrides: Partial<EntityManager> = {}): EntityManager {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    ...overrides,
  } as unknown as EntityManager;
}

describe('TypeOrmWarehouseRepository', () => {
  describe('listActive', () => {
    it('lists warehouses ordered by name and maps every row', async () => {
      const entity = buildEntity();
      const find = jest.fn().mockResolvedValue([entity]);
      const repository = new TypeOrmWarehouseRepository(buildManager({ find }));

      const result = await repository.listActive();

      expect(find).toHaveBeenCalledWith(expect.anything(), { order: { name: 'ASC' } });
      expect(result._unsafeUnwrap()).toEqual([expect.objectContaining({ id: entity.id })]);
    });
  });

  describe('findById', () => {
    it('maps the entity when found', async () => {
      const entity = buildEntity();
      const findOne = jest.fn().mockResolvedValue(entity);
      const repository = new TypeOrmWarehouseRepository(buildManager({ findOne }));

      const result = await repository.findById(entity.id);

      expect(findOne).toHaveBeenCalledWith(expect.anything(), { where: { id: entity.id } });
      expect(result._unsafeUnwrap()).toEqual(expect.objectContaining({ id: entity.id }));
    });

    it('returns null when no entity matches', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const repository = new TypeOrmWarehouseRepository(buildManager({ findOne }));

      const result = await repository.findById('unknown-id');

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });
});
