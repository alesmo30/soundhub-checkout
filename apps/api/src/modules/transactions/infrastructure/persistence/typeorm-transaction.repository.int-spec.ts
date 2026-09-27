import { randomUUID } from 'node:crypto';

import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { NewTransaction } from '../../domain/transaction';
import { TypeOrmTransactionRepository } from './typeorm-transaction.repository';

const NOT_IMPLEMENTED_MESSAGE = 'Not implemented — api 06';

// A transaction FKs into customers and products, neither of which this
// module may import directly (a module talks to another only through its
// index.ts — see references/layering.md). Built here as self-contained raw
// rows, the same way typeorm-delivery.repository.int-spec.ts does for its
// own prerequisite chain. This is test setup, not the raw SQL under test
// (see references/coding-conventions.md#c11--raw-sql-scope).
function randomDocumentNumber(): string {
  return String(1_000_000 + Math.floor(Math.random() * 8_999_999));
}

function randomPhone(): string {
  const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `3${suffix}`;
}

async function insertCustomer(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO customers (document_number, email, full_name, phone)
     VALUES ($1, $2, 'Integration Test', $3)
     RETURNING id`,
    [randomDocumentNumber(), `${randomUUID()}@example.com`, randomPhone()],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test customer');
  return id;
}

async function insertProduct(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO products (sku, name, brand, description, price_cents, image_url, stock_available, stock_reserved)
     VALUES ($1, 'Test Product', 'Test Brand', 'Test description', 100000, '/images/products/test-640.webp', 10, 0)
     RETURNING id`,
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test product');
  return id;
}

async function buildFixtureIds(
  manager: EntityManager,
): Promise<{ customerId: string; productId: string }> {
  const [customerId, productId] = await Promise.all([
    insertCustomer(manager),
    insertProduct(manager),
  ]);
  return { customerId, productId };
}

function buildNewTransaction(
  fields: { customerId: string; productId: string },
  overrides: Partial<NewTransaction> = {},
): NewTransaction {
  const quantity = overrides.quantity ?? 1;
  const unitPriceInCents = overrides.unitPriceInCents ?? 100_000;
  const subtotalInCents = overrides.subtotalInCents ?? unitPriceInCents * quantity;
  const baseFeeInCents = overrides.baseFeeInCents ?? 0;
  const deliveryFeeInCents = overrides.deliveryFeeInCents ?? 0;
  const totalInCents =
    overrides.totalInCents ?? subtotalInCents + baseFeeInCents + deliveryFeeInCents;

  return {
    reference: overrides.reference ?? `TX-${randomUUID().slice(0, 8).toUpperCase()}`,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    requestHash: overrides.requestHash ?? '0'.repeat(64),
    customerId: fields.customerId,
    productId: fields.productId,
    quantity,
    unitPriceInCents,
    subtotalInCents,
    baseFeeInCents,
    deliveryFeeInCents,
    totalInCents,
    currency: overrides.currency ?? 'COP',
    installments: overrides.installments ?? 1,
    cardBrand: overrides.cardBrand ?? 'VISA',
    cardLast4: overrides.cardLast4 ?? '4242',
    reservationExpiresAt: overrides.reservationExpiresAt ?? new Date(Date.now() + 5 * 60_000),
  };
}

describe('TypeOrmTransactionRepository', () => {
  let queryRunner: QueryRunner;
  let repository: TypeOrmTransactionRepository;
  let tx: TypeOrmTxContext;

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
    repository = new TypeOrmTransactionRepository(queryRunner.manager);
    tx = new TypeOrmTxContext(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  describe('insert / findById / findByIdempotencyKey', () => {
    it('inserts a PENDING transaction, findable by id and by idempotency key', async () => {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const newTransaction = buildNewTransaction({ customerId, productId });

      const inserted = (await repository.insert(tx, newTransaction))._unsafeUnwrap();
      const foundById = (await repository.findById(inserted.id, tx))._unsafeUnwrap();
      const foundByKey = (
        await repository.findByIdempotencyKey(newTransaction.idempotencyKey, tx)
      )._unsafeUnwrap();

      expect(inserted.status).toBe('PENDING');
      expect(foundById).toEqual(inserted);
      expect(foundByKey).toEqual(inserted);
    });

    it('returns null for an unknown id and an unknown idempotency key', async () => {
      const byId = (await repository.findById(randomUUID()))._unsafeUnwrap();
      const byKey = (await repository.findByIdempotencyKey(randomUUID()))._unsafeUnwrap();

      expect(byId).toBeNull();
      expect(byKey).toBeNull();
    });

    // SQLSTATE 23505 aborts the surrounding Postgres transaction, so this Err
    // assertion must be the test's last statement (see
    // typeorm-customer.repository.int-spec.ts for the same rule).
    it("returns Err({ constraint: 'IDEMPOTENCY_KEY' }) on a duplicate idempotency key", async () => {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const idempotencyKey = randomUUID();
      await repository.insert(
        tx,
        buildNewTransaction({ customerId, productId }, { idempotencyKey }),
      );

      const result = await repository.insert(
        tx,
        buildNewTransaction({ customerId, productId }, { idempotencyKey }),
      );

      expect(result._unsafeUnwrapErr()).toEqual({ constraint: 'IDEMPOTENCY_KEY' });
    });

    // Same abort rule as above: this is also the test's last statement.
    it("returns Err({ constraint: 'REFERENCE' }) on a duplicate reference", async () => {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const reference = `TX-${randomUUID().slice(0, 8).toUpperCase()}`;
      await repository.insert(tx, buildNewTransaction({ customerId, productId }, { reference }));

      const result = await repository.insert(
        tx,
        buildNewTransaction({ customerId, productId }, { reference }),
      );

      expect(result._unsafeUnwrapErr()).toEqual({ constraint: 'REFERENCE' });
    });
  });

  describe('recordGatewayResponse', () => {
    it('stores the provider transaction id and status message', async () => {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const inserted = (
        await repository.insert(tx, buildNewTransaction({ customerId, productId }))
      )._unsafeUnwrap();

      await repository.recordGatewayResponse(tx, {
        id: inserted.id,
        providerTransactionId: 'gw-12345',
        statusMessage: 'Pending confirmation',
      });

      const reread = (await repository.findById(inserted.id, tx))._unsafeUnwrap();
      expect(reread?.providerTransactionId).toBe('gw-12345');
      expect(reread?.providerStatusMessage).toBe('Pending confirmation');
    });
  });

  describe('finalize', () => {
    it('returns the released stock line on a PENDING transaction, and null on a second call', async () => {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const newTransaction = buildNewTransaction({ customerId, productId });
      const inserted = (await repository.insert(tx, newTransaction))._unsafeUnwrap();

      const first = await repository.finalize(tx, {
        id: inserted.id,
        status: 'ERROR',
        statusMessage: 'Declined by the gateway',
      });
      const second = await repository.finalize(tx, {
        id: inserted.id,
        status: 'ERROR',
        statusMessage: 'Declined by the gateway',
      });

      expect(first._unsafeUnwrap()).toEqual({ productId, quantity: newTransaction.quantity });
      expect(second._unsafeUnwrap()).toBeNull();

      const after = (await repository.findById(inserted.id, tx))._unsafeUnwrap();
      expect(after?.status).toBe('ERROR');
      expect(after?.providerStatusMessage).toBe('Declined by the gateway');
      expect(after?.finalizedAt).not.toBeNull();
    });

    it('leaves a different PENDING transaction untouched', async () => {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const target = (
        await repository.insert(tx, buildNewTransaction({ customerId, productId }))
      )._unsafeUnwrap();
      const other = (
        await repository.insert(tx, buildNewTransaction({ customerId, productId }))
      )._unsafeUnwrap();

      await repository.finalize(tx, {
        id: target.id,
        status: 'VOIDED',
        statusMessage: null,
      });

      const otherAfter = (await repository.findById(other.id, tx))._unsafeUnwrap();
      expect(otherAfter?.status).toBe('PENDING');
    });
  });

  describe('the api 06 stubs', () => {
    it('markEmailSent throws', () => {
      expect(() => repository.markEmailSent()).toThrow(NOT_IMPLEMENTED_MESSAGE);
    });

    it('claimPendingForSync throws', () => {
      expect(() => repository.claimPendingForSync()).toThrow(NOT_IMPLEMENTED_MESSAGE);
    });

    it('claimExpiredReservations throws', () => {
      expect(() => repository.claimExpiredReservations()).toThrow(NOT_IMPLEMENTED_MESSAGE);
    });

    it('findUnsentEmails throws', () => {
      expect(() => repository.findUnsentEmails()).toThrow(NOT_IMPLEMENTED_MESSAGE);
    });
  });
});
