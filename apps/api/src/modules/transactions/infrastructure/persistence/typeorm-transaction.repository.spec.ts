import type { EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';

import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { NewTransaction } from '../../domain/transaction';
import type { TransactionReturningRow } from './transaction.mapper';
import { TypeOrmTransactionRepository } from './typeorm-transaction.repository';
import { TransactionOrmEntity } from './transaction.orm-entity';

const NOT_IMPLEMENTED_MESSAGE = 'Not implemented — api 06';

const RESERVATION_EXPIRES_AT = new Date('2026-09-27T20:05:00.000Z');

function buildNewTransaction(overrides: Partial<NewTransaction> = {}): NewTransaction {
  return {
    reference: 'TX-20260927-ABC123',
    idempotencyKey: 'idem-1',
    requestHash: '0'.repeat(64),
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 1,
    unitPriceInCents: 100_000,
    subtotalInCents: 100_000,
    baseFeeInCents: 0,
    deliveryFeeInCents: 0,
    totalInCents: 100_000,
    currency: 'COP',
    installments: 1,
    cardBrand: 'VISA',
    cardLast4: '4242',
    reservationExpiresAt: RESERVATION_EXPIRES_AT,
    ...overrides,
  };
}

function buildReturningRow(overrides: Partial<TransactionReturningRow> = {}): TransactionReturningRow {
  return {
    id: 'tx-1',
    reference: 'TX-20260927-ABC123',
    idempotency_key: 'idem-1',
    request_hash: '0'.repeat(64),
    customer_id: 'customer-1',
    product_id: 'product-1',
    quantity: 1,
    unit_price_cents: '100000',
    subtotal_cents: '100000',
    base_fee_cents: '0',
    delivery_fee_cents: '0',
    total_cents: '100000',
    currency: 'COP',
    status: 'PENDING',
    installments: 1,
    card_brand: 'VISA',
    card_last4: '4242',
    provider_transaction_id: null,
    provider_status_message: null,
    reservation_expires_at: RESERVATION_EXPIRES_AT,
    finalized_at: null,
    email_sent_at: null,
    created_at: new Date('2026-09-27T20:00:00.000Z'),
    updated_at: new Date('2026-09-27T20:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  };
}

// Chainable stand-ins for TypeORM's query builder: every method returns the
// same object (mirroring the real fluent API) so `.insert().into()....` and
// `.update().set()....` can be asserted call-by-call without a real DataSource.
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

interface UpdateQueryBuilderMock {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
}

function buildUpdateQueryBuilderMock(execute: jest.Mock): UpdateQueryBuilderMock {
  const builder: UpdateQueryBuilderMock = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    execute,
  };
  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
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

describe('TypeOrmTransactionRepository', () => {
  describe('findById', () => {
    it('reads through the constructor manager when no tx is given, and maps the found entity', async () => {
      const { manager, findOne } = buildManagerMock();
      findOne.mockResolvedValue({
        id: 'tx-1',
        reference: 'TX-1',
        idempotencyKey: 'idem-1',
        requestHash: '0'.repeat(64),
        customerId: 'customer-1',
        productId: 'product-1',
        quantity: 1,
        unitPriceCents: 100_000,
        subtotalCents: 100_000,
        baseFeeCents: 0,
        deliveryFeeCents: 0,
        totalCents: 100_000,
        currency: 'COP',
        status: 'PENDING',
        installments: 1,
        cardBrand: 'VISA',
        cardLast4: '4242',
        providerTransactionId: null,
        providerStatusMessage: null,
        reservationExpiresAt: RESERVATION_EXPIRES_AT,
        finalizedAt: null,
        emailSentAt: null,
        createdAt: RESERVATION_EXPIRES_AT,
        updatedAt: RESERVATION_EXPIRES_AT,
        deletedAt: null,
      });
      const repository = new TypeOrmTransactionRepository(manager);

      const result = await repository.findById('tx-1');

      expect(findOne).toHaveBeenCalledWith(TransactionOrmEntity, { where: { id: 'tx-1' } });
      expect(result._unsafeUnwrap()?.id).toBe('tx-1');
    });

    it('returns null when the entity is not found', async () => {
      const { manager, findOne } = buildManagerMock();
      findOne.mockResolvedValue(null);
      const repository = new TypeOrmTransactionRepository(manager);

      const result = await repository.findById('unknown');

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('reads through the tx manager when a TypeOrmTxContext is given', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, findOne: txFindOne } = buildManagerMock();
      txFindOne.mockResolvedValue(null);
      const repository = new TypeOrmTransactionRepository(constructorManager);

      await repository.findById('tx-1', new TypeOrmTxContext(txManager));

      expect(txFindOne).toHaveBeenCalledWith(TransactionOrmEntity, { where: { id: 'tx-1' } });
    });
  });

  describe('findByIdempotencyKey', () => {
    it('reads through the constructor manager when no tx is given', async () => {
      const { manager, findOne } = buildManagerMock();
      findOne.mockResolvedValue(null);
      const repository = new TypeOrmTransactionRepository(manager);

      const result = await repository.findByIdempotencyKey('idem-1');

      expect(findOne).toHaveBeenCalledWith(TransactionOrmEntity, {
        where: { idempotencyKey: 'idem-1' },
      });
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('reads through the tx manager when a TypeOrmTxContext is given', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, findOne: txFindOne } = buildManagerMock();
      txFindOne.mockResolvedValue(null);
      const repository = new TypeOrmTransactionRepository(constructorManager);

      await repository.findByIdempotencyKey('idem-1', new TypeOrmTxContext(txManager));

      expect(txFindOne).toHaveBeenCalledWith(TransactionOrmEntity, {
        where: { idempotencyKey: 'idem-1' },
      });
    });
  });

  describe('insert', () => {
    it('inserts through the tx manager and maps the RETURNING row back to a Transaction', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, createQueryBuilder } = buildManagerMock();
      const row = buildReturningRow();
      const execute = jest.fn().mockResolvedValue({ raw: [row] });
      const builder = buildInsertQueryBuilderMock(execute);
      createQueryBuilder.mockReturnValue(builder);
      const repository = new TypeOrmTransactionRepository(constructorManager);
      const newTransaction = buildNewTransaction();

      const result = await repository.insert(new TypeOrmTxContext(txManager), newTransaction);

      expect(builder.into).toHaveBeenCalledWith(TransactionOrmEntity);
      expect(builder.values).toHaveBeenCalledWith(
        expect.objectContaining({ reference: newTransaction.reference, unitPriceCents: 100_000 }),
      );
      expect(builder.returning).toHaveBeenCalledWith('*');
      expect(result._unsafeUnwrap().id).toBe('tx-1');
      expect(result._unsafeUnwrap().unitPriceInCents).toBe(100_000);
    });

    it('falls back to the constructor manager when tx is not a TypeOrmTxContext', async () => {
      const { manager, createQueryBuilder } = buildManagerMock();
      const execute = jest.fn().mockResolvedValue({ raw: [buildReturningRow()] });
      createQueryBuilder.mockReturnValue(buildInsertQueryBuilderMock(execute));
      const repository = new TypeOrmTransactionRepository(manager);

      await repository.insert({ __brand: 'TxContext' }, buildNewTransaction());

      expect(createQueryBuilder).toHaveBeenCalled();
    });

    it('rejects when the insert returns no row at all (an unexpected driver failure)', async () => {
      const { manager, createQueryBuilder } = buildManagerMock();
      const execute = jest.fn().mockResolvedValue({ raw: [] });
      createQueryBuilder.mockReturnValue(buildInsertQueryBuilderMock(execute));
      const repository = new TypeOrmTransactionRepository(manager);

      await expect(
        repository.insert(new TypeOrmTxContext(manager), buildNewTransaction()),
      ).rejects.toThrow('insert: no row returned for the new transaction');
    });

    it("maps a duplicate idempotency key to Err({ constraint: 'IDEMPOTENCY_KEY' })", async () => {
      const { manager, createQueryBuilder } = buildManagerMock();
      const driverError = { code: '23505', constraint: 'transactions_idempotency_key_key' };
      const execute = jest
        .fn()
        .mockRejectedValue(
          new QueryFailedError('INSERT ...', [], driverError as unknown as Error),
        );
      createQueryBuilder.mockReturnValue(buildInsertQueryBuilderMock(execute));
      const repository = new TypeOrmTransactionRepository(manager);

      const result = await repository.insert(new TypeOrmTxContext(manager), buildNewTransaction());

      expect(result._unsafeUnwrapErr()).toEqual({ constraint: 'IDEMPOTENCY_KEY' });
    });

    it("maps a duplicate reference to Err({ constraint: 'REFERENCE' })", async () => {
      const { manager, createQueryBuilder } = buildManagerMock();
      const driverError = { code: '23505', constraint: 'transactions_reference_key' };
      const execute = jest
        .fn()
        .mockRejectedValue(
          new QueryFailedError('INSERT ...', [], driverError as unknown as Error),
        );
      createQueryBuilder.mockReturnValue(buildInsertQueryBuilderMock(execute));
      const repository = new TypeOrmTransactionRepository(manager);

      const result = await repository.insert(new TypeOrmTxContext(manager), buildNewTransaction());

      expect(result._unsafeUnwrapErr()).toEqual({ constraint: 'REFERENCE' });
    });

    it('re-throws any other database failure instead of folding it into the Result', async () => {
      const { manager, createQueryBuilder } = buildManagerMock();
      const execute = jest.fn().mockRejectedValue(new Error('connection terminated'));
      createQueryBuilder.mockReturnValue(buildInsertQueryBuilderMock(execute));
      const repository = new TypeOrmTransactionRepository(manager);

      await expect(
        repository.insert(new TypeOrmTxContext(manager), buildNewTransaction()),
      ).rejects.toThrow('connection terminated');
    });
  });

  describe('recordGatewayResponse', () => {
    it('updates the provider transaction id and status message through the tx manager', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, createQueryBuilder } = buildManagerMock();
      const execute = jest.fn().mockResolvedValue(undefined);
      const builder = buildUpdateQueryBuilderMock(execute);
      createQueryBuilder.mockReturnValue(builder);
      const repository = new TypeOrmTransactionRepository(constructorManager);

      const result = await repository.recordGatewayResponse(new TypeOrmTxContext(txManager), {
        id: 'tx-1',
        providerTransactionId: 'gw-1',
        statusMessage: 'Pending confirmation',
      });

      expect(builder.set).toHaveBeenCalledWith({
        providerTransactionId: 'gw-1',
        providerStatusMessage: 'Pending confirmation',
      });
      expect(builder.where).toHaveBeenCalledWith('id = :id', { id: 'tx-1' });
      expect(result._unsafeUnwrap()).toBeUndefined();
    });

    it('falls back to the constructor manager when tx is not a TypeOrmTxContext', async () => {
      const { manager, createQueryBuilder } = buildManagerMock();
      const execute = jest.fn().mockResolvedValue(undefined);
      createQueryBuilder.mockReturnValue(buildUpdateQueryBuilderMock(execute));
      const repository = new TypeOrmTransactionRepository(manager);

      await repository.recordGatewayResponse(
        { __brand: 'TxContext' },
        { id: 'tx-1', providerTransactionId: 'gw-1', statusMessage: null },
      );

      expect(createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    it('runs the ERROR finalize statement through the tx manager and maps the released stock line', async () => {
      const { manager: constructorManager } = buildManagerMock();
      const { manager: txManager, query } = buildManagerMock();
      query.mockResolvedValue([[{ product_id: 'product-1', quantity: 2 }], 1]);
      const repository = new TypeOrmTransactionRepository(constructorManager);

      const result = await repository.finalize(new TypeOrmTxContext(txManager), {
        id: 'tx-1',
        status: 'ERROR',
        statusMessage: 'Declined by the gateway',
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'ERROR'"), [
        'tx-1',
        'Declined by the gateway',
      ]);
      expect(result._unsafeUnwrap()).toEqual({ productId: 'product-1', quantity: 2 });
    });

    it('returns null when the conditional UPDATE affects no row (already final)', async () => {
      const { manager, query } = buildManagerMock();
      query.mockResolvedValue([[], 0]);
      const repository = new TypeOrmTransactionRepository(manager);

      const result = await repository.finalize(new TypeOrmTxContext(manager), {
        id: 'tx-1',
        status: 'VOIDED',
        statusMessage: null,
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'VOIDED'"), [
        'tx-1',
        null,
      ]);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('falls back to the constructor manager when tx is not a TypeOrmTxContext', async () => {
      const { manager, query } = buildManagerMock();
      query.mockResolvedValue([[], 0]);
      const repository = new TypeOrmTransactionRepository(manager);

      await repository.finalize(
        { __brand: 'TxContext' },
        { id: 'tx-1', status: 'EXPIRED', statusMessage: null },
      );

      expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'EXPIRED'"), [
        'tx-1',
        null,
      ]);
    });
  });

  describe('the api 06 stubs', () => {
    it('markEmailSent throws', () => {
      const { manager } = buildManagerMock();
      const repository = new TypeOrmTransactionRepository(manager);

      expect(() => repository.markEmailSent()).toThrow(NOT_IMPLEMENTED_MESSAGE);
    });

    it('claimPendingForSync throws', () => {
      const { manager } = buildManagerMock();
      const repository = new TypeOrmTransactionRepository(manager);

      expect(() => repository.claimPendingForSync()).toThrow(NOT_IMPLEMENTED_MESSAGE);
    });

    it('claimExpiredReservations throws', () => {
      const { manager } = buildManagerMock();
      const repository = new TypeOrmTransactionRepository(manager);

      expect(() => repository.claimExpiredReservations()).toThrow(NOT_IMPLEMENTED_MESSAGE);
    });

    it('findUnsentEmails throws', () => {
      const { manager } = buildManagerMock();
      const repository = new TypeOrmTransactionRepository(manager);

      expect(() => repository.findUnsentEmails()).toThrow(NOT_IMPLEMENTED_MESSAGE);
    });
  });
});
