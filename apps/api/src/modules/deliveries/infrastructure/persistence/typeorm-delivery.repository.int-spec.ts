import { randomUUID } from 'node:crypto';

import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { NewDelivery } from '../../application/ports/delivery.repository.port';
import { TypeOrmDeliveryRepository } from './typeorm-delivery.repository';

// A delivery FKs into municipalities, warehouses, customers, products and
// transactions, none of which this module may import directly (a module
// talks to another only through its index.ts — see
// references/layering.md). CI never seeds real data before test:int either,
// so the whole chain is built here as self-contained raw rows, the same way
// shared/infrastructure/persistence/initial-schema.int-spec.ts already does
// for products/customers/transactions. This is test setup, not the raw SQL
// under test (see references/coding-conventions.md#c11--raw-sql-scope).
// This department code is never used by the real seeded DIVIPOLA data.
const FIXTURE_MUNICIPALITY_CODE = '01099';

function randomDocumentNumber(): string {
  return String(1_000_000 + Math.floor(Math.random() * 8_999_999));
}

function randomPhone(): string {
  const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `3${suffix}`;
}

async function ensureFixtureMunicipality(manager: EntityManager): Promise<void> {
  await manager.query(
    `INSERT INTO municipalities (code, name, department_code, department_name, latitude, longitude, is_metro_area)
     VALUES ($1, 'Test Municipality', '01', 'Test Department', 6.25, -75.56, false)
     ON CONFLICT (code) DO NOTHING`,
    [FIXTURE_MUNICIPALITY_CODE],
  );
}

async function insertWarehouse(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO warehouses (name, municipality_code, address, latitude, longitude)
     VALUES ('Test Warehouse', $1, 'Integration test address', 6.2195, -75.584)
     RETURNING id`,
    [FIXTURE_MUNICIPALITY_CODE],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test warehouse');
  return id;
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

async function insertTransaction(
  manager: EntityManager,
  fields: { customerId: string; productId: string },
): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO transactions (
       reference, idempotency_key, request_hash, customer_id, product_id, quantity,
       unit_price_cents, subtotal_cents, base_fee_cents, delivery_fee_cents, total_cents,
       card_brand, card_last4, reservation_expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, 1, 100000, 100000, 0, 0, 100000, 'VISA', '4242', now() + interval '5 minutes'
     ) RETURNING id`,
    [
      `TX-${randomUUID().slice(0, 8).toUpperCase()}`,
      randomUUID(),
      '0'.repeat(64),
      fields.customerId,
      fields.productId,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test transaction');
  return id;
}

async function buildFixtureDelivery(manager: EntityManager): Promise<NewDelivery> {
  await ensureFixtureMunicipality(manager);
  const [warehouseId, customerId, productId] = await Promise.all([
    insertWarehouse(manager),
    insertCustomer(manager),
    insertProduct(manager),
  ]);
  const transactionId = await insertTransaction(manager, { customerId, productId });

  return {
    transactionId,
    warehouseId,
    municipalityCode: FIXTURE_MUNICIPALITY_CODE,
    recipientName: 'Test Recipient',
    phone: randomPhone(),
    addressLine: 'Calle 1 # 2-3',
    addressDetail: null,
    distanceKm: 12,
    feeRule: 'NATIONAL_DISTANCE',
  };
}

describe('TypeOrmDeliveryRepository', () => {
  let queryRunner: QueryRunner;
  let repository: TypeOrmDeliveryRepository;
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
    repository = new TypeOrmDeliveryRepository(queryRunner.manager);
    tx = new TypeOrmTxContext(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  describe('insert / findById / findByTransactionId', () => {
    it('inserts a delivery, AWAITING_PAYMENT, and finds it by id', async () => {
      const newDelivery = await buildFixtureDelivery(queryRunner.manager);

      const inserted = (await repository.insert(tx, newDelivery))._unsafeUnwrap();
      const found = (await repository.findById(inserted.id))._unsafeUnwrap();

      expect(inserted.status).toBe('AWAITING_PAYMENT');
      expect(found).toEqual(inserted);
    });

    it('finds it by transactionId when passed the open tx', async () => {
      const newDelivery = await buildFixtureDelivery(queryRunner.manager);
      const inserted = (await repository.insert(tx, newDelivery))._unsafeUnwrap();

      const found = (
        await repository.findByTransactionId(newDelivery.transactionId, tx)
      )._unsafeUnwrap();

      expect(found).toEqual(inserted);
    });

    // The repository under test is constructed with this same test's
    // queryRunner manager (see beforeEach), so a call with no `tx` argument
    // still reads inside this test's own about-to-be-rolled-back
    // transaction — there is no second, independent connection available to
    // prove cross-transaction isolation against. This mirrors how the
    // customer and stock-reservation rollback int-specs exercise their
    // "no tx" reads.
    it('finds it by transactionId when no tx is passed', async () => {
      const newDelivery = await buildFixtureDelivery(queryRunner.manager);
      const inserted = (await repository.insert(tx, newDelivery))._unsafeUnwrap();

      const found = (
        await repository.findByTransactionId(newDelivery.transactionId)
      )._unsafeUnwrap();

      expect(found).toEqual(inserted);
    });

    it('returns null for an unknown transactionId', async () => {
      const result = await repository.findByTransactionId(randomUUID());

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });

  describe('transition', () => {
    it('changes exactly the targeted delivery to CANCELLED, leaving another untouched', async () => {
      const target = await buildFixtureDelivery(queryRunner.manager);
      const other = await buildFixtureDelivery(queryRunner.manager);
      const insertedTarget = (await repository.insert(tx, target))._unsafeUnwrap();
      const insertedOther = (await repository.insert(tx, other))._unsafeUnwrap();

      const result = await repository.transition(tx, {
        transactionId: target.transactionId,
        to: 'CANCELLED',
      });

      expect(result.isOk()).toBe(true);
      const targetAfter = (await repository.findById(insertedTarget.id))._unsafeUnwrap();
      const otherAfter = (await repository.findById(insertedOther.id))._unsafeUnwrap();
      expect(targetAfter?.status).toBe('CANCELLED');
      expect(otherAfter?.status).toBe('AWAITING_PAYMENT');
    });

    it('is a no-op on a second call, once the row is no longer AWAITING_PAYMENT', async () => {
      const newDelivery = await buildFixtureDelivery(queryRunner.manager);
      const inserted = (await repository.insert(tx, newDelivery))._unsafeUnwrap();
      await repository.transition(tx, {
        transactionId: newDelivery.transactionId,
        to: 'CANCELLED',
      });

      const result = await repository.transition(tx, {
        transactionId: newDelivery.transactionId,
        to: 'CANCELLED',
      });

      expect(result.isOk()).toBe(true);
      const after = (await repository.findById(inserted.id))._unsafeUnwrap();
      expect(after?.status).toBe('CANCELLED');
    });
  });
});
