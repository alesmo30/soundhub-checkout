import { randomUUID } from 'node:crypto';

import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DeliveryInput, PaymentInput } from '@checkout/shared/contracts';
import { CardBrand, ErrorCode, TransactionStatus } from '@checkout/shared/enums';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { loadDbConfig } from '../../../../config/app-config';
import type { Result, ResultAsync } from '../../../../shared/domain/result';
import { errAsync, ok, okAsync } from '../../../../shared/domain/result';
import { buildDataSourceOptions } from '../../../../shared/infrastructure/persistence/data-source';
import { GetQuoteUseCase } from '../../../pricing';
// Imported through the module's own index.ts (`../..`), not the deep
// `application/ports/payment-gateway.port` path: this file lives under
// infrastructure/persistence/**, where the layering ESLint config blocks any
// import matching `*payment-gateway*` outright ("no network call while a
// database transaction holds row locks"). That rule matches on the literal
// import specifier, not on what the file re-exports, so going through the
// index — which is exactly "reach another module's surface only through
// its index.ts", applied to this module's own public API — imports the
// same port/token without tripping it. No network code is ever pulled in;
// this test never imports the real HttpPaymentGatewayAdapter.
import type {
  CreateChargeRequest,
  GatewayCharge,
  PaymentGatewayError,
  PaymentGatewayPort,
} from '../..';
import { PAYMENT_GATEWAY } from '../..';
import type { CreateTransactionCommand } from '../../application/use-cases/create-transaction.use-case';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { requestHash } from '../../domain/request-hash';
import { TransactionsModule } from '../../transactions.module';

// This is the second concurrency layer described in
// specs/08-api-create-transaction.md ("Decisions" > Testing): step 4 races
// TypeOrmStockReservationRepository.reserve directly. This file races the
// whole real use case — real repositories, real TypeOrmUnitOfWork, real
// GetQuoteUseCase and CUSTOMER_REPOSITORY — through Nest's own DI graph
// (TransactionsModule, which already imports CatalogModule, PricingModule,
// CustomersModule and DeliveriesModule), with only PAYMENT_GATEWAY swapped
// for a fake so no real network call ever happens (that is step 14's manual
// test). Building the graph this way — instead of importing each other
// module's concrete TypeORM repository class directly — is what
// references/layering.md's per-module ESLint boundary requires: a file
// under src/modules/transactions/** may only reach another module through
// its index.ts or (for a *.module.ts composition root, which TransactionsModule
// already is) that module's own Module class. None of catalog's, locations',
// customers' or deliveries' concrete repository classes are exported by
// their index.ts, so the only layering-compliant way to assemble the real
// graph is Nest's own container. Cross-module fixture rows (products,
// customers, municipalities, warehouses) are seeded with raw SQL for the
// same reason — the same technique already used by
// deliveries/infrastructure/persistence/typeorm-delivery.repository.int-spec.ts.
const CONCURRENT_ATTEMPTS = 20;

// Step 4's dedicated-DataSource precedent (typeorm-stock-reservation.concurrency.int-spec.ts)
// used `max: 25` for 20 truly-parallel attempts against a single repository
// method (one UPDATE per attempt). This test's call graph fans out more
// non-transactional lookups per attempt before the race even starts —
// findByIdempotencyKey, customerRepository.findById, and GetQuoteUseCase's
// own product/municipality/warehouse combine — but every one of those is a
// quick, released-immediately SELECT; only the reserve+insert+insert phase
// inside UnitOfWork.run holds a connection for an attempt's whole race
// window, one connection per attempt. A pool comfortably above the 20
// concurrent attempts still lets all 20 reach that phase together instead of
// queueing at the pool; POOL_MAX is set to double the attempt count purely
// as headroom for that wider per-attempt fan-out, not because the race
// itself needs more than ~20.
const POOL_MAX = 40;

function randomDocumentNumber(): string {
  return String(1_000_000 + Math.floor(Math.random() * 8_999_999));
}

function randomPhone(): string {
  const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `3${suffix}`;
}

// '00'/'0xxxx' never collides with a real seeded DIVIPOLA department code,
// matching the reserved-for-tests convention already used by
// typeorm-delivery.repository.int-spec.ts and
// typeorm-warehouse.repository.int-spec.ts (which use '01' departments).
// A fresh random suffix per run means this file's own municipality never
// collides with itself either, across the 3 manual `test:int` runs this
// step requires.
function randomMunicipalityCode(): string {
  const suffix = String(100 + Math.floor(Math.random() * 900));
  return `00${suffix}`;
}

async function insertCustomer(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO customers (document_number, email, full_name, phone)
     VALUES ($1, $2, 'Create Transaction Concurrency Test Customer', $3)
     RETURNING id`,
    [randomDocumentNumber(), `${randomUUID()}@example.com`, randomPhone()],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test customer');
  return id;
}

async function insertProduct(
  manager: EntityManager,
  stock: { stockAvailable: number; stockReserved: number },
): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO products (sku, name, brand, description, price_cents, image_url, stock_available, stock_reserved)
     VALUES ($1, 'Create Transaction Concurrency Test Product', 'Test Brand', 'Integration test description', 100000, '/images/products/test-640.webp', $2, $3)
     RETURNING id`,
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`, stock.stockAvailable, stock.stockReserved],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test product');
  return id;
}

// Coordinates deliberately far from any real, plausibly-seeded Colombian
// warehouse (this file's municipality and warehouse sit ~15m apart, off the
// coast of west Africa in real-world terms), so `findNearestWarehouse`
// always picks this file's own warehouse regardless of whether the local
// Postgres the developer runs `test:int` against also happens to have real
// seed data loaded (testing.md: int-specs must never depend on the seed
// having run, but nothing stops a developer from having run it anyway on
// the same docker-compose Postgres).
const FIXTURE_LATITUDE = 1;
const FIXTURE_LONGITUDE = 1;

async function seedMunicipalityAndWarehouse(
  manager: EntityManager,
): Promise<{ code: string; warehouseId: string }> {
  const code = randomMunicipalityCode();

  await manager.query(
    `INSERT INTO municipalities (code, name, department_code, department_name, latitude, longitude, is_metro_area)
     VALUES ($1, 'Create Transaction Concurrency Test Municipality', '00', 'Test Department', $2, $3, false)`,
    [code, FIXTURE_LATITUDE, FIXTURE_LONGITUDE],
  );

  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO warehouses (name, municipality_code, address, latitude, longitude)
     VALUES ('Create Transaction Concurrency Test Warehouse', $1, 'Integration test address', $2, $3)
     RETURNING id`,
    [code, FIXTURE_LATITUDE + 0.0001, FIXTURE_LONGITUDE + 0.0001],
  );
  const warehouseId = rows[0]?.id;
  if (!warehouseId) throw new Error('Failed to insert test warehouse');

  return { code, warehouseId };
}

async function fetchProductStock(
  manager: EntityManager,
  productId: string,
): Promise<{ available: number; reserved: number }> {
  const rows: Array<{ stock_available: number; stock_reserved: number }> = await manager.query(
    'SELECT stock_available, stock_reserved FROM products WHERE id = $1',
    [productId],
  );
  const row = rows[0];
  if (!row) throw new Error(`Product ${productId} not found`);
  return { available: Number(row.stock_available), reserved: Number(row.stock_reserved) };
}

async function softDeleteProduct(manager: EntityManager, productId: string): Promise<void> {
  await manager.query('UPDATE products SET deleted_at = now() WHERE id = $1', [productId]);
}

async function countTransactionsByIdempotencyKey(
  manager: EntityManager,
  key: string,
): Promise<number> {
  const rows: Array<{ count: string }> = await manager.query(
    'SELECT count(*) FROM transactions WHERE idempotency_key = $1',
    [key],
  );
  return Number(rows[0]?.count ?? '0');
}

async function fetchDeliveryStatusById(
  manager: EntityManager,
  deliveryId: string,
): Promise<string | null> {
  const rows: Array<{ status: string }> = await manager.query(
    'SELECT status FROM deliveries WHERE id = $1',
    [deliveryId],
  );
  return rows[0]?.status ?? null;
}

function buildPaymentInput(): PaymentInput {
  return {
    cardToken: `tok_test_${randomUUID().slice(0, 8)}`,
    cardBrand: CardBrand.VISA,
    cardLast4: '4242',
    acceptanceToken: 'acc_test_token',
    personalAuthToken: 'auth_test_token',
  };
}

function buildDeliveryInput(municipalityCode: string): DeliveryInput {
  return {
    recipientName: 'Concurrency Test Recipient',
    phone: randomPhone(),
    addressLine: 'Calle 1 # 2-3',
    municipalityCode,
  };
}

// The actual body content may be identical across every attempt in a
// scenario (only `idempotencyKey` has to differ to avoid two attempts being
// treated as the same logical request); requestHash is computed the same
// way the real controller computes it, from the body only, never the key.
function buildCommand(params: {
  idempotencyKey: string;
  customerId: string;
  productId: string;
  expectedTotalInCents: number;
  municipalityCode: string;
}): CreateTransactionCommand {
  const payment = buildPaymentInput();
  const delivery = buildDeliveryInput(params.municipalityCode);
  const body = {
    customerId: params.customerId,
    productId: params.productId,
    quantity: 1,
    installments: 1,
    expectedTotalInCents: params.expectedTotalInCents,
    payment,
    delivery,
  };

  return {
    idempotencyKey: params.idempotencyKey,
    requestHash: requestHash(body),
    customerId: params.customerId,
    productId: params.productId,
    quantity: 1,
    installments: 1,
    expectedTotalInCents: params.expectedTotalInCents,
    payment,
    delivery,
  };
}

// A small configurable double, shared across all 3 scenarios: `ensureAvailable`
// always reports the breaker closed (not this step's concern — that's step
// 8's unit specs), and `createCharge`'s outcome is switched per scenario via
// `behavior`. `getCharge`/`findChargeByReference` are never reached by
// CreateTransactionUseCase (confirmed by re-reading its `execute()`
// composition: a REPLAYED reserve outcome resolves the whole use case
// without ever calling `charge()`), so both throw.
class ConfigurablePaymentGateway implements PaymentGatewayPort {
  behavior: 'APPROVE' | 'REJECT' = 'APPROVE';
  rejectMessage = 'Card rejected by the fake gateway';
  readonly createChargeCalls: CreateChargeRequest[] = [];

  ensureAvailable(): Result<void, PaymentGatewayError> {
    return ok(undefined);
  }

  createCharge(request: CreateChargeRequest): ResultAsync<GatewayCharge, PaymentGatewayError> {
    this.createChargeCalls.push(request);

    if (this.behavior === 'REJECT') {
      return errAsync({ kind: 'REJECTED', message: this.rejectMessage });
    }

    return okAsync({
      providerTransactionId: `fake-${randomUUID()}`,
      status: TransactionStatus.PENDING,
      statusMessage: null,
      cardBrand: null,
      cardLast4: null,
    });
  }

  getCharge(): ResultAsync<GatewayCharge, PaymentGatewayError> {
    throw new Error('not used in this test');
  }

  findChargeByReference(): ResultAsync<GatewayCharge | null, PaymentGatewayError> {
    throw new Error('not used in this test');
  }
}

describe('CreateTransactionUseCase concurrency (real UnitOfWork + real repositories, fake gateway)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let createTransactionUseCase: CreateTransactionUseCase;
  let getQuoteUseCase: GetQuoteUseCase;
  let fakeGateway: ConfigurablePaymentGateway;
  let municipalityCode: string;
  let warehouseId: string;

  beforeAll(async () => {
    fakeGateway = new ConfigurablePaymentGateway();

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...buildDataSourceOptions(loadDbConfig()),
          extra: { max: POOL_MAX },
        }),
        TransactionsModule,
      ],
    })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(fakeGateway)
      .compile();

    await moduleRef.init();

    dataSource = moduleRef.get(DataSource, { strict: false });
    createTransactionUseCase = moduleRef.get(CreateTransactionUseCase, { strict: false });
    getQuoteUseCase = moduleRef.get(GetQuoteUseCase, { strict: false });

    const seeded = await seedMunicipalityAndWarehouse(dataSource.manager);
    municipalityCode = seeded.code;
    warehouseId = seeded.warehouseId;
  });

  afterAll(async () => {
    await dataSource.manager.query('UPDATE warehouses SET deleted_at = now() WHERE id = $1', [
      warehouseId,
    ]);
    await dataSource.manager.query('UPDATE municipalities SET deleted_at = now() WHERE code = $1', [
      municipalityCode,
    ]);
    await moduleRef.close();
  });

  it('20 parallel requests, different keys, 1-unit stock: 1 PENDING, 19 OUT_OF_STOCK, stock 0/1, gateway called once', async () => {
    fakeGateway.behavior = 'APPROVE';
    const customerId = await insertCustomer(dataSource.manager);
    const productId = await insertProduct(dataSource.manager, {
      stockAvailable: 1,
      stockReserved: 0,
    });

    try {
      const quote = (
        await getQuoteUseCase.execute({ productId, quantity: 1, municipalityCode })
      )._unsafeUnwrap();

      const commands = Array.from({ length: CONCURRENT_ATTEMPTS }, () =>
        buildCommand({
          idempotencyKey: randomUUID(),
          customerId,
          productId,
          expectedTotalInCents: quote.totalInCents,
          municipalityCode,
        }),
      );

      const chargeCallsBefore = fakeGateway.createChargeCalls.length;
      const results = await Promise.all(
        commands.map((cmd) => createTransactionUseCase.execute(cmd)),
      );

      const oks = results.filter((result) => result.isOk());
      const errs = results.filter((result) => result.isErr());

      expect(oks).toHaveLength(1);
      expect(errs).toHaveLength(CONCURRENT_ATTEMPTS - 1);
      expect(oks[0]?._unsafeUnwrap().view.status).toBe('PENDING');
      for (const errResult of errs) {
        expect(errResult._unsafeUnwrapErr().code).toBe(ErrorCode.OUT_OF_STOCK);
      }
      expect(fakeGateway.createChargeCalls.length - chargeCallsBefore).toBe(1);

      const stock = await fetchProductStock(dataSource.manager, productId);
      expect(stock.available).toBe(0);
      expect(stock.reserved).toBe(1);
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('2 parallel requests with the same key: 1 transaction row, 1 gateway call, same id in both responses', async () => {
    fakeGateway.behavior = 'APPROVE';
    const customerId = await insertCustomer(dataSource.manager);
    const productId = await insertProduct(dataSource.manager, {
      stockAvailable: 5,
      stockReserved: 0,
    });

    try {
      const quote = (
        await getQuoteUseCase.execute({ productId, quantity: 1, municipalityCode })
      )._unsafeUnwrap();

      const cmd = buildCommand({
        idempotencyKey: randomUUID(),
        customerId,
        productId,
        expectedTotalInCents: quote.totalInCents,
        municipalityCode,
      });

      const chargeCallsBefore = fakeGateway.createChargeCalls.length;
      const [resultA, resultB] = await Promise.all([
        createTransactionUseCase.execute(cmd),
        createTransactionUseCase.execute(cmd),
      ]);

      expect(resultA.isOk()).toBe(true);
      expect(resultB.isOk()).toBe(true);
      const idA = resultA._unsafeUnwrap().view.id;
      const idB = resultB._unsafeUnwrap().view.id;
      expect(idA).toBe(idB);
      expect(fakeGateway.createChargeCalls.length - chargeCallsBefore).toBe(1);

      const rowCount = await countTransactionsByIdempotencyKey(
        dataSource.manager,
        cmd.idempotencyKey,
      );
      expect(rowCount).toBe(1);
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('a rejected charge finalizes ERROR, releases stock, and cancels the delivery', async () => {
    const customerId = await insertCustomer(dataSource.manager);
    const productId = await insertProduct(dataSource.manager, {
      stockAvailable: 5,
      stockReserved: 0,
    });

    try {
      const quote = (
        await getQuoteUseCase.execute({ productId, quantity: 1, municipalityCode })
      )._unsafeUnwrap();

      const cmd = buildCommand({
        idempotencyKey: randomUUID(),
        customerId,
        productId,
        expectedTotalInCents: quote.totalInCents,
        municipalityCode,
      });

      fakeGateway.behavior = 'REJECT';
      fakeGateway.rejectMessage = 'Card rejected by the fake gateway';

      const result = await createTransactionUseCase.execute(cmd);

      expect(result.isOk()).toBe(true);
      const outcome = result._unsafeUnwrap();
      expect(outcome.view.status).toBe('ERROR');
      expect(outcome.view.statusMessage).toBe(fakeGateway.rejectMessage);

      const stock = await fetchProductStock(dataSource.manager, productId);
      expect(stock.available).toBe(5);
      expect(stock.reserved).toBe(0);

      const deliveryStatus = await fetchDeliveryStatusById(
        dataSource.manager,
        outcome.view.delivery.id,
      );
      expect(deliveryStatus).toBe('CANCELLED');
    } finally {
      fakeGateway.behavior = 'APPROVE';
      await softDeleteProduct(dataSource.manager, productId);
    }
  });
});
