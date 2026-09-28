import type { EntityManager } from 'typeorm';

import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { NewDelivery } from '../../application/ports/delivery.repository.port';
import { DeliveryOrmEntity } from './delivery.orm-entity';
import { TypeOrmDeliveryRepository } from './typeorm-delivery.repository';

const CREATED_AT = new Date('2026-09-27T20:00:00.000Z');
const UPDATED_AT = new Date('2026-09-27T20:00:01.000Z');

function buildOrmEntity(overrides: Partial<DeliveryOrmEntity> = {}): DeliveryOrmEntity {
  return {
    id: 'delivery-1',
    transactionId: 'tx-1',
    warehouseId: 'warehouse-1',
    municipalityCode: '11001',
    status: 'AWAITING_PAYMENT',
    recipientName: 'Jane Doe',
    phone: '3001234567',
    addressLine: 'Calle 1 # 2-3',
    addressDetail: 'Apto 401',
    distanceKm: 5,
    feeRule: 'METRO_FLAT',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    deletedAt: null,
    ...overrides,
  };
}

function buildNewDelivery(overrides: Partial<NewDelivery> = {}): NewDelivery {
  return {
    transactionId: 'tx-1',
    warehouseId: 'warehouse-1',
    municipalityCode: '11001',
    recipientName: 'Jane Doe',
    phone: '3001234567',
    addressLine: 'Calle 1 # 2-3',
    addressDetail: 'Apto 401',
    distanceKm: 5,
    feeRule: 'METRO_FLAT',
    ...overrides,
  };
}

// Chainable stand-in for TypeORM's insert query builder: every method
// returns the same object so `.insert().into()....` can be asserted
// call-by-call without a real DataSource.
interface InsertQueryBuilderMock {
  insert: jest.Mock;
  into: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
  execute: jest.Mock;
}

function buildInsertQueryBuilderMock(execute: jest.Mock): InsertQueryBuilderMock {
  const builder: InsertQueryBuilderMock = {
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    returning: jest.fn(),
    execute,
  };
  builder.insert.mockReturnValue(builder);
  builder.into.mockReturnValue(builder);
  builder.values.mockReturnValue(builder);
  builder.returning.mockReturnValue(builder);
  return builder;
}

function buildManagerMock(): {
  manager: EntityManager;
  findOne: jest.Mock;
  createQueryBuilder: jest.Mock;
  query: jest.Mock;
} {
  const findOne = jest.fn();
  const createQueryBuilder = jest.fn();
  const query = jest.fn();
  const manager = { findOne, createQueryBuilder, query } as unknown as EntityManager;
  return { manager, findOne, createQueryBuilder, query };
}

describe('TypeOrmDeliveryRepository', () => {
  describe('findById', () => {
    it('reads through the constructor manager and maps the found entity', async () => {
      const { manager, findOne } = buildManagerMock();
      findOne.mockResolvedValue(buildOrmEntity());
      const repository = new TypeOrmDeliveryRepository(manager);

      const result = await repository.findById('delivery-1');

      expect(findOne).toHaveBeenCalledWith(DeliveryOrmEntity, { where: { id: 'delivery-1' } });
      expect(result._unsafeUnwrap()?.id).toBe('delivery-1');
    });

    it('returns null when the entity is not found', async () => {
      const { manager, findOne } = buildManagerMock();
      findOne.mockResolvedValue(null);
      const repository = new TypeOrmDeliveryRepository(manager);

      const result = await repository.findById('unknown');

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });

  describe('findByTransactionId', () => {
    it('reads through the constructor manager when no tx is given, and maps the found entity', async () => {
      const { manager, findOne } = buildManagerMock();
      findOne.mockResolvedValue(buildOrmEntity());
      const repository = new TypeOrmDeliveryRepository(manager);

      const result = await repository.findByTransactionId('tx-1');

      expect(findOne).toHaveBeenCalledWith(DeliveryOrmEntity, { where: { transactionId: 'tx-1' } });
      expect(result._unsafeUnwrap()?.transactionId).toBe('tx-1');
    });

    it('returns null when no delivery exists for the transaction', async () => {
      const { manager, findOne } = buildManagerMock();
      findOne.mockResolvedValue(null);
      const repository = new TypeOrmDeliveryRepository(manager);

      const result = await repository.findByTransactionId('unknown-tx');

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('reads through the tx manager when a TypeOrmTxContext is given', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, findOne: txFindOne } = buildManagerMock();
      txFindOne.mockResolvedValue(null);
      const repository = new TypeOrmDeliveryRepository(constructorManager);

      await repository.findByTransactionId('tx-1', new TypeOrmTxContext(txManager));

      expect(txFindOne).toHaveBeenCalledWith(DeliveryOrmEntity, {
        where: { transactionId: 'tx-1' },
      });
    });
  });

  describe('insert', () => {
    it('inserts through the tx manager and maps the generated row back to a Delivery', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, createQueryBuilder } = buildManagerMock();
      const generated = buildOrmEntity();
      const execute = jest.fn().mockResolvedValue({ generatedMaps: [generated] });
      const builder = buildInsertQueryBuilderMock(execute);
      createQueryBuilder.mockReturnValue(builder);
      const repository = new TypeOrmDeliveryRepository(constructorManager);
      const newDelivery = buildNewDelivery();

      const result = await repository.insert(new TypeOrmTxContext(txManager), newDelivery);

      expect(builder.into).toHaveBeenCalledWith(DeliveryOrmEntity);
      expect(builder.values).toHaveBeenCalledWith(newDelivery);
      expect(builder.returning).toHaveBeenCalledWith('*');
      expect(result._unsafeUnwrap().id).toBe('delivery-1');
      expect(result._unsafeUnwrap().transactionId).toBe('tx-1');
    });

    it('falls back to the constructor manager when tx is not a TypeOrmTxContext', async () => {
      const { manager, createQueryBuilder } = buildManagerMock();
      const execute = jest.fn().mockResolvedValue({ generatedMaps: [buildOrmEntity()] });
      createQueryBuilder.mockReturnValue(buildInsertQueryBuilderMock(execute));
      const repository = new TypeOrmDeliveryRepository(manager);

      await repository.insert({ __brand: 'TxContext' } as never, buildNewDelivery());

      expect(createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('transition', () => {
    it('runs the READY_TO_SHIP statement through the tx manager', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, query } = buildManagerMock();
      query.mockResolvedValue(undefined);
      const repository = new TypeOrmDeliveryRepository(constructorManager);

      const result = await repository.transition(new TypeOrmTxContext(txManager), {
        transactionId: 'tx-1',
        to: 'READY_TO_SHIP',
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'READY_TO_SHIP'"), [
        'tx-1',
      ]);
      expect(result._unsafeUnwrap()).toBeUndefined();
    });

    it('runs the CANCELLED statement through the tx manager', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, query } = buildManagerMock();
      query.mockResolvedValue(undefined);
      const repository = new TypeOrmDeliveryRepository(constructorManager);

      const result = await repository.transition(new TypeOrmTxContext(txManager), {
        transactionId: 'tx-1',
        to: 'CANCELLED',
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'CANCELLED'"), ['tx-1']);
      expect(result._unsafeUnwrap()).toBeUndefined();
    });

    it('falls back to the constructor manager when tx is not a TypeOrmTxContext', async () => {
      const { manager, query } = buildManagerMock();
      query.mockResolvedValue(undefined);
      const repository = new TypeOrmDeliveryRepository(manager);

      await repository.transition({ __brand: 'TxContext' } as never, {
        transactionId: 'tx-1',
        to: 'CANCELLED',
      });

      expect(query).toHaveBeenCalled();
    });
  });
});
