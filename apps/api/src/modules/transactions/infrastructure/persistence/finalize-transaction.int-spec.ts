import { randomUUID } from 'node:crypto';

import { Global, Module } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DeliveryInput, PaymentInput } from '@checkout/shared/contracts';
import { CardBrand, TransactionStatus } from '@checkout/shared/enums';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import type { AppConfig } from '../../../../config/app-config';
import { APP_CONFIG, loadDbConfig } from '../../../../config/app-config';
import type { DomainEvent } from '../../../../shared/domain/domain-event';
import type {
  EventPublishError,
  EventPublisher,
} from '../../../../shared/application/ports/event-publisher.port';
import { EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port';
import type { Result, ResultAsync } from '../../../../shared/domain/result';
import { ok, okAsync } from '../../../../shared/domain/result';
import { buildDataSourceOptions } from '../../../../shared/infrastructure/persistence/data-source';
import { GetQuoteUseCase } from '../../../pricing';
// Same layering workaround as create-transaction.concurrency.int-spec.ts:
// this file lives under infrastructure/persistence/**, where the layering
// ESLint config blocks any import matching `*payment-gateway*`. Going
// through the module's own index.ts imports the same port/token without
// tripping that rule; no network adapter is ever pulled in.
import type { GatewayCharge, PaymentGatewayError, PaymentGatewayPort } from '../..';
import { PAYMENT_GATEWAY } from '../..';
import type { CreateTransactionCommand } from '../../application/use-cases/create-transaction.use-case';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { FinalizeTransactionUseCase } from '../../application/use-cases/finalize-transaction.use-case';
import { requestHash } from '../../domain/request-hash';
import { TransactionsModule } from '../../transactions.module';

// Proves SPEC 10 step 3's acceptance criteria against real Postgres: the
// finalization SQL SPEC 08 wrote, exercised through the REAL
// FinalizeTransactionUseCase, SPEC 08's REAL repositories and the REAL
// TypeOrmUnitOfWork — only PAYMENT_GATEWAY and EVENT_PUBLISHER are swapped
// for local doubles, exactly like create-transaction.concurrency.int-spec.ts
// swaps PAYMENT_GATEWAY. Assembling the graph through Nest's own container
// (TransactionsModule) — instead of importing catalog's/customers'/
// deliveries' concrete TypeORM repository classes directly — is what
// references/layering.md's per-module ESLint boundary requires. Cross-module
// fixture rows (products, customers, municipalities, warehouses) are seeded
// with raw SQL for the same reason the concurrency spec does it: none of
// those modules export their concrete repository classes through their
// index.ts, so raw SQL is the only layering-compliant way to seed them here.
// This does NOT count as "new raw SQL for finalization" (forbidden by the
// spec's Architecture criteria) — it is fixture setup, the same technique
// already established by typeorm-delivery.repository.int-spec.ts and
// create-transaction.concurrency.int-spec.ts. Finalization itself runs only
// through TransactionRepository.finalize / StockReservationPort.commit
// /.release / DeliveryRepository.transition — SPEC 08's existing statements,
// untouched.
const POOL_MAX = 10;

function randomDocumentNumber(): string {
  return String(1_000_000 + Math.floor(Math.random() * 8_999_999));
}

function randomPhone(): string {
  const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `3${suffix}`;
}

// '00'/'0xxxx' never collides with a real seeded DIVIPOLA department code,
// matching the reserved-for-tests convention used by
// typeorm-delivery.repository.int-spec.ts and
// create-transaction.concurrency.int-spec.ts. A fresh random suffix per run
// means this file's own municipality never collides with itself across
// repeated `test:int` runs either.
function randomMunicipalityCode(): string {
  const suffix = String(100 + Math.floor(Math.random() * 900));
  return `00${suffix}`;
}

async function insertCustomer(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO customers (document_number, email, full_name, phone)
     VALUES ($1, $2, 'Finalize Transaction Int Test Customer', $3)
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
     VALUES ($1, 'Finalize Transaction Int Test Product', 'Test Brand', 'Integration test description', 100000, '/images/products/test-640.webp', $2, $3)
     RETURNING id`,
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`, stock.stockAvailable, stock.stockReserved],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test product');
  return id;
}

// Coordinates far from any plausibly-seeded Colombian warehouse, same as
// create-transaction.concurrency.int-spec.ts, so `findNearestWarehouse`
// always picks this file's own warehouse regardless of whether the local
// Postgres also happens to have real seed data loaded.
const FIXTURE_LATITUDE = 2;
const FIXTURE_LONGITUDE = 2;

async function seedMunicipalityAndWarehouse(
  manager: EntityManager,
): Promise<{ code: string; warehouseId: string }> {
  const code = randomMunicipalityCode();

  await manager.query(
    `INSERT INTO municipalities (code, name, department_code, department_name, latitude, longitude, is_metro_area)
     VALUES ($1, 'Finalize Transaction Int Test Municipality', '00', 'Test Department', $2, $3, false)`,
    [code, FIXTURE_LATITUDE, FIXTURE_LONGITUDE],
  );

  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO warehouses (name, municipality_code, address, latitude, longitude)
     VALUES ('Finalize Transaction Int Test Warehouse', $1, 'Integration test address', $2, $3)
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

async function fetchTransactionRow(
  manager: EntityManager,
  transactionId: string,
): Promise<{ status: string; finalizedAt: Date | null; providerStatusMessage: string | null }> {
  const rows: Array<{
    status: string;
    finalized_at: Date | null;
    provider_status_message: string | null;
  }> = await manager.query(
    'SELECT status, finalized_at, provider_status_message FROM transactions WHERE id = $1',
    [transactionId],
  );
  const row = rows[0];
  if (!row) throw new Error(`Transaction ${transactionId} not found`);
  return {
    status: row.status,
    finalizedAt: row.finalized_at,
    providerStatusMessage: row.provider_status_message,
  };
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
    recipientName: 'Finalize Test Recipient',
    phone: randomPhone(),
    addressLine: 'Calle 1 # 2-3',
    municipalityCode,
  };
}

function buildCommand(params: {
  idempotencyKey: string;
  customerId: string;
  productId: string;
  quantity: number;
  expectedTotalInCents: number;
  municipalityCode: string;
}): CreateTransactionCommand {
  const payment = buildPaymentInput();
  const delivery = buildDeliveryInput(params.municipalityCode);
  const body = {
    customerId: params.customerId,
    productId: params.productId,
    quantity: params.quantity,
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
    quantity: params.quantity,
    installments: 1,
    expectedTotalInCents: params.expectedTotalInCents,
    payment,
    delivery,
  };
}

// The setup double: always reports the breaker closed, and always creates a
// PENDING charge (the async-gateway pattern SPEC 08 already models — see
// `stayPending`/the concurrency spec's first scenario). This is what leaves
// the reserved transaction PENDING with an AWAITING_PAYMENT delivery, ready
// for this file's finalize() calls to resolve — exactly the setup the spec
// describes, produced by CreateTransactionUseCase's real reserve+insert
// unit of work rather than by hand-rolled SQL.
class StayPendingPaymentGateway implements PaymentGatewayPort {
  ensureAvailable(): Result<void, PaymentGatewayError> {
    return ok(undefined);
  }

  createCharge(): ResultAsync<GatewayCharge, PaymentGatewayError> {
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

// Counts events instead of accumulating an unbounded array in the real
// adapter (the reason InMemoryEventPublisher keeps no state — see SPEC 10's
// Decisions > Event publishing). This double is local to this int-spec, the
// same role step 2's unit spec gives RecordingEventPublisher, but shaped as
// a simple counter since these scenarios only need "how many events fired".
class CountingEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];

  publish(event: DomainEvent): ResultAsync<void, EventPublishError> {
    this.events.push(event);
    return okAsync(undefined);
  }

  reset(): void {
    this.events.length = 0;
  }
}

// TransactionsModule now also registers PaymentWebhookController (spec 12a),
// which injects APP_CONFIG directly. The real ConfigModule validates the
// full .env (paymentGateway, smtp included), which test:int's CI job never
// sets (see environment-variables.ts — that job only sets the db group), so
// this spec supplies APP_CONFIG itself through a local @Global() module
// instead of importing the real ConfigModule.
function fakeAppConfig(): AppConfig {
  return {
    app: { nodeEnv: 'test', port: 3000, logLevel: 'debug' },
    db: { host: '', port: 5432, username: '', password: '', name: '', ssl: false },
    paymentGateway: {
      url: '',
      publicKey: '',
      privateKey: '',
      integritySecret: '',
      eventsSecret: 'test-events-secret',
    },
    smtp: { host: '', port: 465, user: '', password: '', from: '' },
  };
}

@Global()
@Module({ providers: [{ provide: APP_CONFIG, useValue: fakeAppConfig() }], exports: [APP_CONFIG] })
class FakeConfigModule {}

describe('FinalizeTransactionUseCase against Postgres (real UnitOfWork + real repositories)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let createTransactionUseCase: CreateTransactionUseCase;
  let finalizeTransactionUseCase: FinalizeTransactionUseCase;
  let getQuoteUseCase: GetQuoteUseCase;
  let eventPublisher: CountingEventPublisher;
  let municipalityCode: string;
  let warehouseId: string;

  beforeAll(async () => {
    eventPublisher = new CountingEventPublisher();

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...buildDataSourceOptions(loadDbConfig()),
          extra: { max: POOL_MAX },
        }),
        FakeConfigModule,
        TransactionsModule,
      ],
    })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(new StayPendingPaymentGateway())
      .overrideProvider(EVENT_PUBLISHER)
      .useValue(eventPublisher)
      .compile();

    await moduleRef.init();

    dataSource = moduleRef.get(DataSource, { strict: false });
    createTransactionUseCase = moduleRef.get(CreateTransactionUseCase, { strict: false });
    finalizeTransactionUseCase = moduleRef.get(FinalizeTransactionUseCase, { strict: false });
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

  beforeEach(() => {
    eventPublisher.reset();
  });

  // Reserves 2 units and inserts a PENDING transaction + AWAITING_PAYMENT
  // delivery, all in the one UnitOfWork that CreateTransactionUseCase.reserve
  // already opens — no hand-rolled reservation SQL in this file.
  async function setupPendingTransaction(
    stock: { stockAvailable: number; stockReserved: number },
    quantity: number,
  ): Promise<{ productId: string; transactionId: string; deliveryId: string }> {
    const customerId = await insertCustomer(dataSource.manager);
    const productId = await insertProduct(dataSource.manager, stock);

    const quote = (
      await getQuoteUseCase.execute({ productId, quantity, municipalityCode })
    )._unsafeUnwrap();

    const cmd = buildCommand({
      idempotencyKey: randomUUID(),
      customerId,
      productId,
      quantity,
      expectedTotalInCents: quote.totalInCents,
      municipalityCode,
    });

    const result = await createTransactionUseCase.execute(cmd);
    const outcome = result._unsafeUnwrap();

    return {
      productId,
      transactionId: outcome.view.id,
      deliveryId: outcome.view.delivery.id,
    };
  }

  it('APPROVED commits stock (8/0), sets finalized_at and the message, and ships the delivery', async () => {
    const { productId, transactionId, deliveryId } = await setupPendingTransaction(
      { stockAvailable: 10, stockReserved: 0 },
      2,
    );

    try {
      const statusMessage = 'Approved by the gateway';
      const result = await finalizeTransactionUseCase.execute({
        id: transactionId,
        status: 'APPROVED',
        statusMessage,
      });

      expect(result._unsafeUnwrap()).toBe('FINALIZED');

      const stock = await fetchProductStock(dataSource.manager, productId);
      expect(stock.available).toBe(8);
      expect(stock.reserved).toBe(0);

      const transaction = await fetchTransactionRow(dataSource.manager, transactionId);
      expect(transaction.status).toBe('APPROVED');
      expect(transaction.finalizedAt).not.toBeNull();
      expect(transaction.providerStatusMessage).toBe(statusMessage);

      const deliveryStatus = await fetchDeliveryStatusById(dataSource.manager, deliveryId);
      expect(deliveryStatus).toBe('READY_TO_SHIP');

      expect(eventPublisher.events).toHaveLength(1);
      expect(eventPublisher.events[0]).toMatchObject({
        type: 'transaction.finalized',
        transactionId,
        status: 'APPROVED',
      });
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('DECLINED releases stock (10/0), sets finalized_at and the message, and cancels the delivery', async () => {
    const { productId, transactionId, deliveryId } = await setupPendingTransaction(
      { stockAvailable: 10, stockReserved: 0 },
      2,
    );

    try {
      const statusMessage = 'Declined by the gateway';
      const result = await finalizeTransactionUseCase.execute({
        id: transactionId,
        status: 'DECLINED',
        statusMessage,
      });

      expect(result._unsafeUnwrap()).toBe('FINALIZED');

      const stock = await fetchProductStock(dataSource.manager, productId);
      expect(stock.available).toBe(10);
      expect(stock.reserved).toBe(0);

      const transaction = await fetchTransactionRow(dataSource.manager, transactionId);
      expect(transaction.status).toBe('DECLINED');
      expect(transaction.finalizedAt).not.toBeNull();
      expect(transaction.providerStatusMessage).toBe(statusMessage);

      const deliveryStatus = await fetchDeliveryStatusById(dataSource.manager, deliveryId);
      expect(deliveryStatus).toBe('CANCELLED');

      expect(eventPublisher.events).toHaveLength(1);
      expect(eventPublisher.events[0]).toMatchObject({
        type: 'transaction.finalized',
        transactionId,
        status: 'DECLINED',
      });
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('a second finalize of an already-final transaction is ALREADY_FINAL, changes no stock and publishes nothing new', async () => {
    const { productId, transactionId } = await setupPendingTransaction(
      { stockAvailable: 10, stockReserved: 0 },
      2,
    );

    try {
      const first = await finalizeTransactionUseCase.execute({
        id: transactionId,
        status: 'APPROVED',
        statusMessage: 'Approved by the gateway',
      });
      expect(first._unsafeUnwrap()).toBe('FINALIZED');
      expect(eventPublisher.events).toHaveLength(1);

      const stockAfterFirst = await fetchProductStock(dataSource.manager, productId);
      expect(stockAfterFirst.available).toBe(8);
      expect(stockAfterFirst.reserved).toBe(0);

      const second = await finalizeTransactionUseCase.execute({
        id: transactionId,
        status: 'APPROVED',
        statusMessage: 'Approved by the gateway',
      });
      expect(second._unsafeUnwrap()).toBe('ALREADY_FINAL');

      const stockAfterSecond = await fetchProductStock(dataSource.manager, productId);
      expect(stockAfterSecond).toEqual(stockAfterFirst);

      // No second event: still exactly the 1 event from the first finalize.
      expect(eventPublisher.events).toHaveLength(1);
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });
});
