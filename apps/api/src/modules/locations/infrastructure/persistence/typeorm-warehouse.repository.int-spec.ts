import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { MunicipalityOrmEntity } from './municipality.orm-entity';
import { WarehouseOrmEntity } from './warehouse.orm-entity';
import { TypeOrmWarehouseRepository } from './typeorm-warehouse.repository';

// CI never seeds real data before running test:int (only migrations), so
// warehouse fixtures must satisfy the municipality_code FK with a
// self-contained row instead of assuming a real seeded code exists.
// DIVIPOLA department codes actually seeded never start with this prefix,
// so it can never collide with a real, committed municipality.
const FIXTURE_MUNICIPALITY_CODE = '01001';

async function ensureFixtureMunicipality(manager: EntityManager): Promise<void> {
  await manager.getRepository(MunicipalityOrmEntity).save({
    code: FIXTURE_MUNICIPALITY_CODE,
    name: 'Test Municipality',
    departmentCode: '01',
    departmentName: 'Test Department',
    latitude: 6.25,
    longitude: -75.56,
    isMetroArea: false,
  });
}

// Fixture names below never take the real seeded warehouses' "<City> DC"
// shape, so they can never collide with a committed row when asserting order.
function buildWarehouseRow(
  overrides: Partial<WarehouseOrmEntity> = {},
): Partial<WarehouseOrmEntity> {
  return {
    name: overrides.name ?? 'Test Warehouse',
    municipalityCode: overrides.municipalityCode ?? FIXTURE_MUNICIPALITY_CODE,
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
    await ensureFixtureMunicipality(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  it('listActive is ordered by name', async () => {
    const warehouses = (await repository.listActive())._unsafeUnwrap();
    const names = warehouses.map((warehouse) => warehouse.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
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

  it('returns coordinates as JS numbers, not strings', async () => {
    const fixture = await insertWarehouse(queryRunner.manager, {
      name: 'Coordinates Test Warehouse',
    });

    const warehouse = (await repository.findById(fixture.id))._unsafeUnwrap();

    expect(warehouse).not.toBeNull();
    expect(typeof warehouse?.latitude).toBe('number');
    expect(typeof warehouse?.longitude).toBe('number');
  });
});
