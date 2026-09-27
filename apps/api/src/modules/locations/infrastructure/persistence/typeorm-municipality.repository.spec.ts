import type { EntityManager } from 'typeorm';

import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { MunicipalityOrmEntity } from './municipality.orm-entity';
import { TypeOrmMunicipalityRepository } from './typeorm-municipality.repository';

function buildEntity(overrides: Partial<MunicipalityOrmEntity> = {}): MunicipalityOrmEntity {
  return {
    code: '05001',
    name: 'Medellín',
    departmentCode: '05',
    departmentName: 'Antioquia',
    latitude: 6.244203,
    longitude: -75.581212,
    isMetroArea: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildQueryBuilder(rawRows: unknown[]): {
  select: jest.Mock;
  addSelect: jest.Mock;
  distinct: jest.Mock;
  orderBy: jest.Mock;
  getRawMany: jest.Mock;
} {
  const builder = {
    select: jest.fn(),
    addSelect: jest.fn(),
    distinct: jest.fn(),
    orderBy: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  };
  builder.select.mockReturnValue(builder);
  builder.addSelect.mockReturnValue(builder);
  builder.distinct.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);

  return builder;
}

function buildManager(overrides: Partial<EntityManager> = {}): EntityManager {
  return {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    ...overrides,
  } as unknown as EntityManager;
}

describe('TypeOrmMunicipalityRepository', () => {
  describe('listDepartments', () => {
    it('selects the distinct department code/name pair ordered by name', async () => {
      const rows = [{ code: '05', name: 'Antioquia' }];
      const queryBuilder = buildQueryBuilder(rows);
      const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
      const repository = new TypeOrmMunicipalityRepository(buildManager({ createQueryBuilder }));

      const result = await repository.listDepartments();

      expect(queryBuilder.distinct).toHaveBeenCalledWith(true);
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('municipality.departmentName', 'ASC');
      expect(result._unsafeUnwrap()).toEqual(rows);
    });
  });

  describe('listByDepartment', () => {
    it('finds by department code, ordered by name, and maps every row', async () => {
      const entity = buildEntity();
      const find = jest.fn().mockResolvedValue([entity]);
      const repository = new TypeOrmMunicipalityRepository(buildManager({ find }));

      const result = await repository.listByDepartment('05');

      expect(find).toHaveBeenCalledWith(expect.anything(), {
        where: { departmentCode: '05' },
        order: { name: 'ASC' },
      });
      expect(result._unsafeUnwrap()).toEqual([expect.objectContaining({ code: entity.code })]);
    });

    it('returns an empty list for a department with no municipalities', async () => {
      const find = jest.fn().mockResolvedValue([]);
      const repository = new TypeOrmMunicipalityRepository(buildManager({ find }));

      const result = await repository.listByDepartment('98');

      expect(result._unsafeUnwrap()).toEqual([]);
    });
  });

  describe('findByCode', () => {
    it('uses its own manager and maps the entity when found', async () => {
      const entity = buildEntity();
      const findOne = jest.fn().mockResolvedValue(entity);
      const repository = new TypeOrmMunicipalityRepository(buildManager({ findOne }));

      const result = await repository.findByCode(entity.code);

      expect(findOne).toHaveBeenCalledWith(expect.anything(), { where: { code: entity.code } });
      expect(result._unsafeUnwrap()).toEqual(expect.objectContaining({ code: entity.code }));
    });

    it('returns null when no entity matches', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const repository = new TypeOrmMunicipalityRepository(buildManager({ findOne }));

      const result = await repository.findByCode('00000');

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('uses the tx manager instead of its own when a TypeOrmTxContext is given', async () => {
      const entity = buildEntity();
      const ownFindOne = jest.fn().mockResolvedValue(null);
      const txFindOne = jest.fn().mockResolvedValue(entity);
      const repository = new TypeOrmMunicipalityRepository(buildManager({ findOne: ownFindOne }));
      const tx = new TypeOrmTxContext(buildManager({ findOne: txFindOne }));

      const result = await repository.findByCode(entity.code, tx);

      expect(txFindOne).toHaveBeenCalled();
      expect(ownFindOne).not.toHaveBeenCalled();
      expect(result._unsafeUnwrap()).toEqual(expect.objectContaining({ code: entity.code }));
    });
  });
});
