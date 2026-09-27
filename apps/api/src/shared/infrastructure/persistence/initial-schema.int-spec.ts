import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import dataSource from './data-source';

interface PgError {
  readonly code: string;
  readonly constraint?: string;
}

function randomSku(): string {
  return `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function randomDocumentNumber(): string {
  return String(1_000_000 + Math.floor(Math.random() * 8_999_999));
}

function randomPhone(): string {
  const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `3${suffix}`;
}

async function insertProduct(
  source: DataSource,
  overrides: Partial<{
    sku: string;
    priceCents: number;
    stockAvailable: number;
    stockReserved: number;
  }> = {},
): Promise<string> {
  const rows: Array<{ id: string }> = await source.query(
    `INSERT INTO products (sku, name, brand, description, price_cents, image_url, stock_available, stock_reserved)
     VALUES ($1, 'Test Product', 'Test Brand', 'Test description', $2, '/images/products/test-640.webp', $3, $4)
     RETURNING id`,
    [
      overrides.sku ?? randomSku(),
      overrides.priceCents ?? 100_000,
      overrides.stockAvailable ?? 10,
      overrides.stockReserved ?? 0,
    ],
  );

  const id = rows[0]?.id;
  if (!id) {
    throw new Error('Failed to insert test product');
  }
  return id;
}

async function insertCustomer(source: DataSource): Promise<string> {
  const rows: Array<{ id: string }> = await source.query(
    `INSERT INTO customers (document_number, email, full_name, phone)
     VALUES ($1, $2, 'Integration Test', $3)
     RETURNING id`,
    [randomDocumentNumber(), `${randomUUID()}@example.com`, randomPhone()],
  );

  const id = rows[0]?.id;
  if (!id) {
    throw new Error('Failed to insert test customer');
  }
  return id;
}

async function insertTransaction(
  source: DataSource,
  fields: {
    customerId: string;
    productId: string;
    quantity?: number;
    unitPriceCents?: number;
    subtotalCents?: number;
    baseFeeCents?: number;
    deliveryFeeCents?: number;
    totalCents?: number;
    status?: string;
    finalizedAt?: Date | null;
  },
): Promise<void> {
  const quantity = fields.quantity ?? 1;
  const unitPriceCents = fields.unitPriceCents ?? 100_000;
  const subtotalCents = fields.subtotalCents ?? unitPriceCents * quantity;
  const baseFeeCents = fields.baseFeeCents ?? 5_000;
  const deliveryFeeCents = fields.deliveryFeeCents ?? 5_000;
  const totalCents = fields.totalCents ?? subtotalCents + baseFeeCents + deliveryFeeCents;
  const status = fields.status ?? 'PENDING';
  const finalizedAt =
    fields.finalizedAt === undefined
      ? status === 'PENDING'
        ? null
        : new Date()
      : fields.finalizedAt;

  await source.query(
    `INSERT INTO transactions (
       reference, idempotency_key, request_hash, customer_id, product_id, quantity,
       unit_price_cents, subtotal_cents, base_fee_cents, delivery_fee_cents, total_cents,
       status, card_brand, card_last4, reservation_expires_at, finalized_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'VISA', '4242', now() + interval '5 minutes', $13
     )`,
    [
      `TX-${randomUUID().slice(0, 8)}`,
      randomUUID(),
      '0'.repeat(64),
      fields.customerId,
      fields.productId,
      quantity,
      unitPriceCents,
      subtotalCents,
      baseFeeCents,
      deliveryFeeCents,
      totalCents,
      status,
      finalizedAt,
    ],
  );
}

describe('initial schema constraints', () => {
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    await dataSource.initialize();
    customerId = await insertCustomer(dataSource);
    productId = await insertProduct(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('rejects negative stock', async () => {
    await expect(insertProduct(dataSource, { stockAvailable: -1 })).rejects.toMatchObject<
      Partial<PgError>
    >({
      code: '23514',
      constraint: 'products_stock_available_check',
    });
  });

  it('rejects a total that does not equal subtotal + fees', async () => {
    await expect(
      insertTransaction(dataSource, {
        customerId,
        productId,
        subtotalCents: 100_000,
        baseFeeCents: 5_000,
        deliveryFeeCents: 5_000,
        totalCents: 999_999,
      }),
    ).rejects.toMatchObject<Partial<PgError>>({ code: '23514', constraint: 'chk_total' });
  });

  it('rejects a subtotal that does not equal price × quantity', async () => {
    await expect(
      insertTransaction(dataSource, {
        customerId,
        productId,
        quantity: 2,
        unitPriceCents: 100_000,
        subtotalCents: 100_000,
      }),
    ).rejects.toMatchObject<Partial<PgError>>({ code: '23514', constraint: 'chk_subtotal' });
  });

  it('rejects a quantity of 11', async () => {
    await expect(
      insertTransaction(dataSource, {
        customerId,
        productId,
        quantity: 11,
        subtotalCents: 1_100_000,
      }),
    ).rejects.toMatchObject<Partial<PgError>>({
      code: '23514',
      constraint: 'transactions_quantity_check',
    });
  });

  it('rejects an invalid phone number', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO customers (document_number, email, full_name, phone) VALUES ($1, $2, 'Bad Phone', $3)`,
        [randomDocumentNumber(), `${randomUUID()}@example.com`, '12345'],
      ),
    ).rejects.toMatchObject<Partial<PgError>>({
      code: '23514',
      constraint: 'customers_phone_check',
    });
  });

  it('rejects a PENDING transaction with a non-null finalized_at', async () => {
    await expect(
      insertTransaction(dataSource, {
        customerId,
        productId,
        status: 'PENDING',
        finalizedAt: new Date(),
      }),
    ).rejects.toMatchObject<Partial<PgError>>({ code: '23514', constraint: 'chk_finalized' });
  });

  it('rejects a finalized transaction with a null finalized_at', async () => {
    await expect(
      insertTransaction(dataSource, {
        customerId,
        productId,
        status: 'APPROVED',
        finalizedAt: null,
      }),
    ).rejects.toMatchObject<Partial<PgError>>({ code: '23514', constraint: 'chk_finalized' });
  });

  it('lets a soft-deleted SKU be re-inserted', async () => {
    const sku = randomSku();

    await insertProduct(dataSource, { sku });
    await dataSource.query(`UPDATE products SET deleted_at = now() WHERE sku = $1`, [sku]);

    await expect(insertProduct(dataSource, { sku })).resolves.toBeDefined();
  });
});
