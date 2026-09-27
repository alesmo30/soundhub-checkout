import { toWarehouse } from './warehouse.mapper';
import type { WarehouseOrmEntity } from './warehouse.orm-entity';

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

describe('toWarehouse', () => {
  it('maps every ORM column to its domain field', () => {
    const entity = buildEntity();

    expect(toWarehouse(entity)).toEqual({
      id: entity.id,
      name: entity.name,
      municipalityCode: entity.municipalityCode,
      address: entity.address,
      latitude: entity.latitude,
      longitude: entity.longitude,
    });
  });

  it('does not leak ORM-only columns such as updatedAt or deletedAt', () => {
    const entity = buildEntity();

    expect(toWarehouse(entity)).not.toHaveProperty('updatedAt');
    expect(toWarehouse(entity)).not.toHaveProperty('deletedAt');
  });
});
