import { randomUUID } from 'node:crypto';

import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { NewCustomer } from '../../application/ports/customer.repository.port';
import { CustomerOrmEntity } from './customer.orm-entity';
import { TypeOrmCustomerRepository } from './typeorm-customer.repository';

// document_number: CHECK (document_number ~ '^[0-9]{6,10}$'); 7 random
// digits never collides with a real, previously seeded customer (there is
// no customer seed, but this also keeps fixtures self-explanatory).
function randomDocumentNumber(): string {
  return String(Math.floor(1_000_000 + Math.random() * 9_000_000));
}

// phone: CHECK (phone ~ '^3[0-9]{9}$').
function randomPhone(): string {
  return `3${Math.floor(100_000_000 + Math.random() * 900_000_000)}`;
}

function buildNewCustomer(overrides: Partial<NewCustomer> = {}): NewCustomer {
  return {
    documentNumber: overrides.documentNumber ?? randomDocumentNumber(),
    email: overrides.email ?? `test-${randomUUID().slice(0, 8)}@mail.com`,
    fullName: overrides.fullName ?? 'Test Customer',
    phone: overrides.phone ?? randomPhone(),
  };
}

function insertCustomer(
  manager: EntityManager,
  overrides: Partial<NewCustomer> = {},
): Promise<CustomerOrmEntity> {
  return manager.getRepository(CustomerOrmEntity).save(buildNewCustomer(overrides));
}

describe('TypeOrmCustomerRepository', () => {
  let queryRunner: QueryRunner;
  let repository: TypeOrmCustomerRepository;

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
    repository = new TypeOrmCustomerRepository(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  describe('findById', () => {
    it('returns the mapped customer for a known id', async () => {
      const fixture = await insertCustomer(queryRunner.manager);

      const result = await repository.findById(fixture.id);

      expect(result._unsafeUnwrap()).toEqual({
        id: fixture.id,
        documentNumber: fixture.documentNumber,
        email: fixture.email,
        fullName: fixture.fullName,
        phone: fixture.phone,
      });
    });

    it('returns null for an unknown id', async () => {
      const result = await repository.findById(randomUUID());

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('excludes a soft-deleted row', async () => {
      const fixture = await insertCustomer(queryRunner.manager);
      await queryRunner.manager.getRepository(CustomerOrmEntity).softDelete(fixture.id);

      const result = await repository.findById(fixture.id);

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });

  describe('findByDocumentNumber', () => {
    it('returns the mapped customer for a known document number', async () => {
      const fixture = await insertCustomer(queryRunner.manager);

      const result = await repository.findByDocumentNumber(fixture.documentNumber);

      expect(result._unsafeUnwrap()).toEqual({
        id: fixture.id,
        documentNumber: fixture.documentNumber,
        email: fixture.email,
        fullName: fixture.fullName,
        phone: fixture.phone,
      });
    });

    it('returns null for an unknown document number', async () => {
      const result = await repository.findByDocumentNumber(randomDocumentNumber());

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('excludes a soft-deleted row', async () => {
      const fixture = await insertCustomer(queryRunner.manager);
      await queryRunner.manager.getRepository(CustomerOrmEntity).softDelete(fixture.id);

      const result = await repository.findByDocumentNumber(fixture.documentNumber);

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('finds a stored lowercase email when queried in upper case', async () => {
      const email = `ana-${randomUUID().slice(0, 6)}@mail.com`;
      const fixture = await insertCustomer(queryRunner.manager, { email });

      const result = await repository.findByEmail(email.toUpperCase());

      expect(result._unsafeUnwrap()?.id).toBe(fixture.id);
    });

    it('returns null for an unknown email', async () => {
      const result = await repository.findByEmail(`unknown-${randomUUID()}@mail.com`);

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });

  describe('insert', () => {
    it('returns the created row', async () => {
      const newCustomer = buildNewCustomer();
      const tx = new TypeOrmTxContext(queryRunner.manager);

      const result = await repository.insert(tx, newCustomer);
      const customer = result._unsafeUnwrap();

      expect(customer.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(customer).toEqual({
        id: customer.id,
        documentNumber: newCustomer.documentNumber,
        email: newCustomer.email,
        fullName: newCustomer.fullName,
        phone: newCustomer.phone,
      });
    });

    // SQLSTATE 23505 aborts the surrounding Postgres transaction, so this
    // Err assertion must be the test's last statement: any further query in
    // this same transaction would fail with "current transaction is
    // aborted" (the afterEach rollback still succeeds).
    it("returns Err({ constraint: 'DOCUMENT' }) on a duplicate document number", async () => {
      const documentNumber = randomDocumentNumber();
      await insertCustomer(queryRunner.manager, { documentNumber });
      const tx = new TypeOrmTxContext(queryRunner.manager);

      const result = await repository.insert(tx, buildNewCustomer({ documentNumber }));

      expect(result._unsafeUnwrapErr()).toEqual({ constraint: 'DOCUMENT' });
    });

    // Same abort rule as above: this is also the test's last statement.
    it("returns Err({ constraint: 'EMAIL' }) on a duplicate email in a different case", async () => {
      const email = `dup-${randomUUID().slice(0, 6)}@mail.com`;
      await insertCustomer(queryRunner.manager, { email });
      const tx = new TypeOrmTxContext(queryRunner.manager);

      const result = await repository.insert(tx, buildNewCustomer({ email: email.toUpperCase() }));

      expect(result._unsafeUnwrapErr()).toEqual({ constraint: 'EMAIL' });
    });
  });

  describe('updateContact', () => {
    it('changes only fullName and phone, leaving documentNumber and email untouched', async () => {
      const fixture = await insertCustomer(queryRunner.manager);
      const tx = new TypeOrmTxContext(queryRunner.manager);
      const newPhone = randomPhone();

      const result = await repository.updateContact(tx, {
        id: fixture.id,
        fullName: 'Updated Test Name',
        phone: newPhone,
      });

      expect(result._unsafeUnwrap()).toEqual({
        id: fixture.id,
        documentNumber: fixture.documentNumber,
        email: fixture.email,
        fullName: 'Updated Test Name',
        phone: newPhone,
      });
    });
  });
});
