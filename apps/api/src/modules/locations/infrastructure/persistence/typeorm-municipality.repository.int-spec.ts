import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import { MunicipalityOrmEntity } from './municipality.orm-entity';
import { TypeOrmMunicipalityRepository } from './typeorm-municipality.repository';

// DIVIPOLA department codes actually seeded (see SPEC 02's seed data) never
// start with these two-digit prefixes, so fixture municipality codes built
// from them can never collide with a real, committed row.
const UNKNOWN_DEPARTMENT_CODE = '01';
const COLLATION_DEPARTMENT_CODE = '02';
const DISTINCT_DEPARTMENT_CODE = '03';
const TX_DEPARTMENT_CODE = '04';
const SOFT_DELETE_DEPARTMENT_CODE = '06';

function buildMunicipalityRow(
  code: string,
  overrides: Partial<MunicipalityOrmEntity> = {},
): Partial<MunicipalityOrmEntity> {
  return {
    code,
    name: overrides.name ?? `Test Municipality ${code}`,
    departmentCode: overrides.departmentCode ?? code.slice(0, 2),
    departmentName: overrides.departmentName ?? `Test Department ${code.slice(0, 2)}`,
    latitude: overrides.latitude ?? 6.25,
    longitude: overrides.longitude ?? -75.56,
    isMetroArea: overrides.isMetroArea ?? false,
  };
}

function insertMunicipality(
  manager: EntityManager,
  code: string,
  overrides: Partial<MunicipalityOrmEntity> = {},
): Promise<MunicipalityOrmEntity> {
  return manager.getRepository(MunicipalityOrmEntity).save(buildMunicipalityRow(code, overrides));
}

let codeSuffixCounter = 0;

// Monotonic, not random: two calls in the same test must never collide,
// since the primary key is a plain char(5) with no room for a UUID.
function randomCodeSuffix(): string {
  codeSuffixCounter += 1;
  return String(codeSuffixCounter).padStart(3, '0');
}

describe('TypeOrmMunicipalityRepository', () => {
  let queryRunner: QueryRunner;
  let repository: TypeOrmMunicipalityRepository;

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
    repository = new TypeOrmMunicipalityRepository(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  it('listDepartments is distinct and sorted by name', async () => {
    await insertMunicipality(
      queryRunner.manager,
      `${DISTINCT_DEPARTMENT_CODE}${randomCodeSuffix()}`,
      { departmentCode: DISTINCT_DEPARTMENT_CODE, departmentName: 'Zzz Test Department' },
    );
    await insertMunicipality(
      queryRunner.manager,
      `${DISTINCT_DEPARTMENT_CODE}${randomCodeSuffix()}`,
      { departmentCode: DISTINCT_DEPARTMENT_CODE, departmentName: 'Zzz Test Department' },
    );

    const departments = (await repository.listDepartments())._unsafeUnwrap();
    const matching = departments.filter(
      (department) => department.code === DISTINCT_DEPARTMENT_CODE,
    );
    const names = departments.map((department) => department.name);

    expect(matching).toHaveLength(1);
    expect(matching[0]).toEqual({ code: DISTINCT_DEPARTMENT_CODE, name: 'Zzz Test Department' });
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('listByDepartment sorts by name using the database collation', async () => {
    const suffix = randomCodeSuffix();
    await insertMunicipality(queryRunner.manager, `${COLLATION_DEPARTMENT_CODE}${suffix}`, {
      departmentCode: COLLATION_DEPARTMENT_CODE,
      name: 'Zetaquira',
    });
    const abejorralCode = `${COLLATION_DEPARTMENT_CODE}${randomCodeSuffix()}`;
    await insertMunicipality(queryRunner.manager, abejorralCode, {
      departmentCode: COLLATION_DEPARTMENT_CODE,
      name: 'Abejorral',
    });
    const abregoCode = `${COLLATION_DEPARTMENT_CODE}${randomCodeSuffix()}`;
    await insertMunicipality(queryRunner.manager, abregoCode, {
      departmentCode: COLLATION_DEPARTMENT_CODE,
      name: 'Ábrego',
    });

    const municipalities = (
      await repository.listByDepartment(COLLATION_DEPARTMENT_CODE)
    )._unsafeUnwrap();

    expect(municipalities.map((municipality) => municipality.name)).toEqual([
      'Abejorral',
      'Ábrego',
      'Zetaquira',
    ]);
  });

  it('listByDepartment excludes soft-deleted rows', async () => {
    const kept = await insertMunicipality(
      queryRunner.manager,
      `${SOFT_DELETE_DEPARTMENT_CODE}${randomCodeSuffix()}`,
      { departmentCode: SOFT_DELETE_DEPARTMENT_CODE, name: 'Kept Municipality' },
    );
    const deleted = await insertMunicipality(
      queryRunner.manager,
      `${SOFT_DELETE_DEPARTMENT_CODE}${randomCodeSuffix()}`,
      { departmentCode: SOFT_DELETE_DEPARTMENT_CODE, name: 'Deleted Municipality' },
    );
    await queryRunner.manager.getRepository(MunicipalityOrmEntity).softDelete(deleted.code);

    const municipalities = (
      await repository.listByDepartment(SOFT_DELETE_DEPARTMENT_CODE)
    )._unsafeUnwrap();
    const codes = municipalities.map((municipality) => municipality.code);

    expect(codes).toContain(kept.code);
    expect(codes).not.toContain(deleted.code);
  });

  it('listByDepartment returns [] for an unknown department code', async () => {
    const municipalities = (
      await repository.listByDepartment(UNKNOWN_DEPARTMENT_CODE)
    )._unsafeUnwrap();

    expect(municipalities).toEqual([]);
  });

  it('findByCode returns null for an unknown code', async () => {
    const result = await repository.findByCode('00000');

    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('findByCode(code, tx) sees a row inserted in that same tx but not outside it', async () => {
    const outerRepository = new TypeOrmMunicipalityRepository(dataSource.manager);
    const code = `${TX_DEPARTMENT_CODE}${randomCodeSuffix()}`;
    const fixture = await insertMunicipality(queryRunner.manager, code, {
      departmentCode: TX_DEPARTMENT_CODE,
    });
    const tx = new TypeOrmTxContext(queryRunner.manager);

    const withoutTx = (await outerRepository.findByCode(fixture.code))._unsafeUnwrap();
    expect(withoutTx).toBeNull();

    const withTx = (await outerRepository.findByCode(fixture.code, tx))._unsafeUnwrap();
    expect(withTx?.code).toBe(fixture.code);
  });

  it('returns coordinates as JS numbers, not strings, for a real seeded municipality', async () => {
    const medellin = (await repository.findByCode('05001'))._unsafeUnwrap();

    expect(medellin).not.toBeNull();
    expect(typeof medellin?.latitude).toBe('number');
    expect(typeof medellin?.longitude).toBe('number');
  });
});
