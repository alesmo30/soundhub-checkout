import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { WarehouseOrmEntity } from './warehouse.orm-entity';
import { TypeOrmWarehouseRepository } from './typeorm-warehouse.repository';

// The four real seeded warehouses (see warehouses.json) are named
// "<City> DC". Fixture names below never take that shape, so they can
// never collide with a committed row when asserting order or presence.
function buildWarehouseRow(
  overrides: Partial<WarehouseOrmEntity> = {},
): Partial<WarehouseOrmEntity> {
  return {
    name: overrides.name ?? 'Test Warehouse',
    municipalityCode: overrides.municipalityCode ?? '05001',
    address: overrides.address ?? 'Integration test address',
    latitude: overrides.latitude ?? 6.2195,
    longitude: overrides.longitude ?? -75.584,
  };
}

function insertWarehouse(
  manager: EntityManager,
  overrides: Partial<WarehouseOrmEntity> = {},
): Promise<WarehouseOrmEntity> {
  return manager.getRepository(WarehouseOrmEntity).save(buildWarehouseRow(overrides));
}

describe('TypeOrmWarehouseRepository', () => {
  let queryRunner: QueryRunner;
  let repository: TypeOrmWarehouseRepository;

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
    repository = new TypeOrmWarehouseRepository(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  it('listActive is ordered by name and includes the real seeded warehouses', async () => {
    const warehouses = (await repository.listActive())._unsafeUnwrap();
    const names = warehouses.map((warehouse) => warehouse.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual(
      expect.arrayContaining(['Medellín DC', 'Bogotá DC', 'Cali DC', 'Barranquilla DC']),
    );
  });

  it('listActive orders inserted fixtures alphabetically, not by insertion order', async () => {
    await insertWarehouse(queryRunner.manager, { name: 'Zzz Test Warehouse' });
    await insertWarehouse(queryRunner.manager, { name: 'Aaa Test Warehouse' });

    const warehouses = (await repository.listActive())._unsafeUnwrap();
    const testNames = warehouses
      .map((warehouse) => warehouse.name)
      .filter((name) => name.endsWith('Test Warehouse'));

    expect(testNames).toEqual(['Aaa Test Warehouse', 'Zzz Test Warehouse']);
  });

  it('listActive excludes a soft-deleted warehouse', async () => {
    const kept = await insertWarehouse(queryRunner.manager, { name: 'Kept Test Warehouse' });
    const deleted = await insertWarehouse(queryRunner.manager, { name: 'Deleted Test Warehouse' });
    await queryRunner.manager.getRepository(WarehouseOrmEntity).softDelete(deleted.id);

    const warehouses = (await repository.listActive())._unsafeUnwrap();
    const ids = warehouses.map((warehouse) => warehouse.id);

    expect(ids).toContain(kept.id);
    expect(ids).not.toContain(deleted.id);
  });

  it('findById returns the mapped warehouse for a known id', async () => {
    const fixture = await insertWarehouse(queryRunner.manager, { name: 'Findable Test Warehouse' });

    const warehouse = (await repository.findById(fixture.id))._unsafeUnwrap();

    expect(warehouse).toEqual({
      id: fixture.id,
      name: fixture.name,
      municipalityCode: fixture.municipalityCode,
      address: fixture.address,
      latitude: fixture.latitude,
      longitude: fixture.longitude,
    });
  });

  it('findById returns null for an unknown id', async () => {
    const result = await repository.findById('00000000-0000-4000-8000-000000000000');

    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('findById returns null for a soft-deleted warehouse', async () => {
    const deleted = await insertWarehouse(queryRunner.manager, {
      name: 'Soft Deleted Test Warehouse',
    });
    await queryRunner.manager.getRepository(WarehouseOrmEntity).softDelete(deleted.id);

    const result = await repository.findById(deleted.id);

    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('returns coordinates as JS numbers, not strings, for a real seeded warehouse', async () => {
    const warehouses = (await repository.listActive())._unsafeUnwrap();
    const medellin = warehouses.find((warehouse) => warehouse.name === 'Medellín DC');

    expect(medellin).not.toBeUndefined();
    expect(typeof medellin?.latitude).toBe('number');
    expect(typeof medellin?.longitude).toBe('number');
  });
});
