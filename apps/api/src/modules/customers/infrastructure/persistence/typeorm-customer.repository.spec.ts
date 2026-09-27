import type { EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';

import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { CustomerOrmEntity } from './customer.orm-entity';
import { TypeOrmCustomerRepository } from './typeorm-customer.repository';

function buildEntity(overrides: Partial<CustomerOrmEntity> = {}): CustomerOrmEntity {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    documentNumber: '1020304050',
    email: 'ana@mail.com',
    fullName: 'Ana Perez',
    phone: '3001234567',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

interface MockQueryBuilder {
  where: jest.Mock;
  getOne: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  into: jest.Mock;
  set: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
  execute: jest.Mock;
}

function buildQueryBuilder(): MockQueryBuilder {
  const builder = {
    where: jest.fn(),
    getOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    into: jest.fn(),
    set: jest.fn(),
    values: jest.fn(),
    returning: jest.fn(),
    execute: jest.fn(),
  };
  for (const key of ['where', 'insert', 'update', 'into', 'set', 'values', 'returning'] as const) {
    builder[key].mockReturnValue(builder);
  }

  return builder;
}

function buildManager(overrides: Partial<EntityManager> = {}): EntityManager {
  return {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as unknown as EntityManager;
}

describe('TypeOrmCustomerRepository', () => {
  describe('findById', () => {
    it('uses its own manager and maps the entity when found', async () => {
      const entity = buildEntity();
      const findOne = jest.fn().mockResolvedValue(entity);
      const repository = new TypeOrmCustomerRepository(buildManager({ findOne }));

      const result = await repository.findById(entity.id);

      expect(findOne).toHaveBeenCalledWith(expect.anything(), { where: { id: entity.id } });
      expect(result._unsafeUnwrap()).toEqual({
        id: entity.id,
        documentNumber: entity.documentNumber,
        email: entity.email,
        fullName: entity.fullName,
        phone: entity.phone,
      });
    });

    it('returns null when no entity matches', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const repository = new TypeOrmCustomerRepository(buildManager({ findOne }));

      const result = await repository.findById('unknown-id');

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('uses the tx manager instead of its own when a TypeOrmTxContext is given', async () => {
      const entity = buildEntity();
      const ownFindOne = jest.fn().mockResolvedValue(null);
      const txFindOne = jest.fn().mockResolvedValue(entity);
      const repository = new TypeOrmCustomerRepository(buildManager({ findOne: ownFindOne }));
      const tx = new TypeOrmTxContext(buildManager({ findOne: txFindOne }));

      const result = await repository.findById(entity.id, tx);

      expect(txFindOne).toHaveBeenCalled();
      expect(ownFindOne).not.toHaveBeenCalled();
      expect(result._unsafeUnwrap()).toEqual(expect.objectContaining({ id: entity.id }));
    });
  });

  describe('findByDocumentNumber', () => {
    it('finds by documentNumber and maps the entity', async () => {
      const entity = buildEntity();
      const findOne = jest.fn().mockResolvedValue(entity);
      const repository = new TypeOrmCustomerRepository(buildManager({ findOne }));

      const result = await repository.findByDocumentNumber(entity.documentNumber);

      expect(findOne).toHaveBeenCalledWith(expect.anything(), {
        where: { documentNumber: entity.documentNumber },
      });
      expect(result._unsafeUnwrap()).toEqual(expect.objectContaining({ id: entity.id }));
    });

    it('returns null when no entity matches', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const repository = new TypeOrmCustomerRepository(buildManager({ findOne }));

      const result = await repository.findByDocumentNumber('0000000000');

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('queries with LOWER(email) = LOWER(:email) and maps the entity', async () => {
      const entity = buildEntity();
      const queryBuilder = buildQueryBuilder();
      queryBuilder.getOne.mockResolvedValue(entity);
      const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
      const repository = new TypeOrmCustomerRepository(buildManager({ createQueryBuilder }));

      const result = await repository.findByEmail('ANA@Mail.com');

      expect(createQueryBuilder).toHaveBeenCalledWith(expect.anything(), 'customer');
      expect(queryBuilder.where).toHaveBeenCalledWith('LOWER(customer.email) = LOWER(:email)', {
        email: 'ANA@Mail.com',
      });
      expect(result._unsafeUnwrap()).toEqual(expect.objectContaining({ id: entity.id }));
    });

    it('returns null when no entity matches', async () => {
      const queryBuilder = buildQueryBuilder();
      queryBuilder.getOne.mockResolvedValue(null);
      const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
      const repository = new TypeOrmCustomerRepository(buildManager({ createQueryBuilder }));

      const result = await repository.findByEmail('unknown@mail.com');

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });

  describe('insert', () => {
    it('inserts through the tx manager and maps the returned row', async () => {
      const entity = buildEntity();
      const queryBuilder = buildQueryBuilder();
      queryBuilder.execute.mockResolvedValue({ generatedMaps: [entity] });
      const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
      const tx = new TypeOrmTxContext(buildManager({ createQueryBuilder }));
      const repository = new TypeOrmCustomerRepository(buildManager());

      const result = await repository.insert(tx, {
        documentNumber: entity.documentNumber,
        email: entity.email,
        fullName: entity.fullName,
        phone: entity.phone,
      });

      expect(queryBuilder.into).toHaveBeenCalled();
      expect(queryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result._unsafeUnwrap()).toEqual(
        expect.objectContaining({ id: entity.id, documentNumber: entity.documentNumber }),
      );
    });

    it('returns Err({ constraint }) when the insert fails on a known unique index', async () => {
      const queryBuilder = buildQueryBuilder();
      const driverError = { code: '23505', constraint: 'uq_customers_email' };
      queryBuilder.execute.mockRejectedValue(
        new QueryFailedError('INSERT ...', [], driverError as unknown as Error),
      );
      const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
      const tx = new TypeOrmTxContext(buildManager({ createQueryBuilder }));
      const repository = new TypeOrmCustomerRepository(buildManager());

      const result = await repository.insert(tx, {
        documentNumber: '1020304050',
        email: 'dup@mail.com',
        fullName: 'Dup Customer',
        phone: '3001234567',
      });

      expect(result._unsafeUnwrapErr()).toEqual({ constraint: 'EMAIL' });
    });

    it('re-throws an error that is not a known unique violation', async () => {
      const queryBuilder = buildQueryBuilder();
      queryBuilder.execute.mockRejectedValue(new Error('connection lost'));
      const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
      const tx = new TypeOrmTxContext(buildManager({ createQueryBuilder }));
      const repository = new TypeOrmCustomerRepository(buildManager());

      await expect(
        repository.insert(tx, {
          documentNumber: '1020304050',
          email: 'other@mail.com',
          fullName: 'Other Customer',
          phone: '3001234567',
        }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('updateContact', () => {
    it('updates fullName/phone through the tx manager and maps the returned row', async () => {
      const entity = buildEntity({ fullName: 'Updated Name', phone: '3009999999' });
      const queryBuilder = buildQueryBuilder();
      queryBuilder.execute.mockResolvedValue({
        raw: [
          {
            id: entity.id,
            document_number: entity.documentNumber,
            email: entity.email,
            full_name: entity.fullName,
            phone: entity.phone,
          },
        ],
      });
      const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
      const tx = new TypeOrmTxContext(buildManager({ createQueryBuilder }));
      const repository = new TypeOrmCustomerRepository(buildManager());

      const result = await repository.updateContact(tx, {
        id: entity.id,
        fullName: 'Updated Name',
        phone: '3009999999',
      });

      expect(queryBuilder.set).toHaveBeenCalledWith({
        fullName: 'Updated Name',
        phone: '3009999999',
      });
      expect(queryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result._unsafeUnwrap()).toEqual({
        id: entity.id,
        documentNumber: entity.documentNumber,
        email: entity.email,
        fullName: 'Updated Name',
        phone: '3009999999',
      });
    });
  });
});
