import { randomUUID } from 'node:crypto';

import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DeliveryInput, PaymentInput } from '@checkout/shared/contracts';
import { CardBrand, TransactionStatus } from '@checkout/shared/enums';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { loadDbConfig } from '../../../../config/app-config';
import type { Clock } from '../../../../shared/application/ports/clock.port';
import { CLOCK } from '../../../../shared/application/ports/clock.port';
import type { DomainEvent } from '../../../../shared/domain/domain-event';
import type {
  EventPublishError,
  EventPublisher,
} from '../../../../shared/application/ports/event-publisher.port';
import { EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port';
import type { Result, ResultAsync } from '../../../../shared/domain/result';
import { ok, okAsync } from '../../../../shared/domain/result';
import { buildDataSourceOptions } from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmUnitOfWork } from '../../../../shared/infrastructure/persistence/typeorm-unit-of-work';
import { GetQuoteUseCase } from '../../../pricing';
// Same layering workaround as finalize-transaction.int-spec.ts and
// create-transaction.concurrency.int-spec.ts: this file lives under
// infrastructure/persistence/**, where the layering ESLint config blocks any
// import matching `*payment-gateway*`. Going through the module's own
// index.ts imports the same port/token without tripping that rule.
import type { GatewayCharge, PaymentGatewayError, PaymentGatewayPort } from '../..';
import { PAYMENT_GATEWAY } from '../..';
import type { DeliveryRepository } from '../../../deliveries';
import { DELIVERY_REPOSITORY } from '../../../deliveries';
import type { StockReservationPort } from '../../application/ports/stock-reservation.port';
import { STOCK_RESERVATION } from '../../application/ports/stock-reservation.port';
import type { TransactionRepository } from '../../application/ports/transaction.repository.port';
import { TRANSACTION_REPOSITORY } from '../../application/ports/transaction.repository.port';
import type { CreateTransactionCommand } from '../../application/use-cases/create-transaction.use-case';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import type { FinalizeTransactionDependencies } from '../../application/use-cases/finalize-transaction.use-case';
import { FinalizeTransactionUseCase } from '../../application/use-cases/finalize-transaction.use-case';
import type { FinalizeTransactionResult } from '../../application/use-cases/finalize-transaction.use-case';
import { requestHash } from '../../domain/request-hash';
import { TransactionsModule } from '../../transactions.module';

// Proves SPEC 10 step 4's acceptance criteria: 3 real, genuinely-parallel
// `FinalizeTransactionUseCase.execute` calls racing the same PENDING
// transaction end with exactly 1 state change. Reuses step 3's setup
// (finalize-transaction.int-spec.ts) verbatim — same TestingModule wiring
// (TransactionsModule with PAYMENT_GATEWAY/EVENT_PUBLISHER swapped for local
// doubles), same fixture helpers, same setupPendingTransaction() built on
// the real CreateTransactionUseCase. Only this describe block's own test is
// new.
//
// Real parallelism, per the spec's Risks table row for this exact scenario
// ("The concurrency int-spec passes without really racing, because the
// calls run one after another" → mitigation: "Each call gets its own
// TypeOrmUnitOfWork, the setup checks the pool size is ≥ 3..."): rather than
// resolving one shared `FinalizeTransactionUseCase` from the DI container
// (the pattern create-transaction.concurrency.int-spec.ts and
// typeorm-stock-reservation.concurrency.int-spec.ts use, where N calls share
// one `unitOfWork`/use-case object and still race at the connection level
// because `DataSource.transaction()` checks out a fresh connection per
// call), this file builds 3 separate `FinalizeTransactionUseCase` instances
// by hand, each constructed with its own `new TypeOrmUnitOfWork(dataSource)`
// — literally 3 distinct `UnitOfWork` objects, never shared across the 3
// calls. The stateless collaborators (repositories, clock, the counting
// publisher) are still resolved once from the DI container and shared,
// since none of them hold per-call connection state — every repository
// method takes the `TxContext` as a parameter instead. `POOL_MAX` is
// asserted at ≥ 3 so the 3 calls can reach Postgres together instead of
// queueing at the pool.
const POOL_MAX = 10;
const CONCURRENT_FINALIZES = 3;

function randomDocumentNumber(): string {
  return String(1_000_000 + Math.floor(Math.random() * 8_999_999));
}

function randomPhone(): string {
  const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `3${suffix}`;
}

// '00'/'0xxxx' never collides with a real seeded DIVIPOLA department code,
// matching the reserved-for-tests convention used by
// finalize-transaction.int-spec.ts and create-transaction.concurrency.int-spec.ts.
function randomMunicipalityCode(): string {
  const suffix = String(100 + Math.floor(Math.random() * 900));
  return `00${suffix}`;
}

async function insertCustomer(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO customers (document_number, email, full_name, phone)
     VALUES ($1, $2, 'Finalize Transaction Concurrency Test Customer', $3)
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
     VALUES ($1, 'Finalize Transaction Concurrency Test Product', 'Test Brand', 'Integration test description', 100000, '/images/products/test-640.webp', $2, $3)
     RETURNING id`,
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`, stock.stockAvailable, stock.stockReserved],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test product');
  return id;
}

// Coordinates far from any plausibly-seeded Colombian warehouse, same as
// finalize-transaction.int-spec.ts, so `findNearestWarehouse` always picks
// this file's own warehouse.
const FIXTURE_LATITUDE = 3;
const FIXTURE_LONGITUDE = 3;

async function seedMunicipalityAndWarehouse(
  manager: EntityManager,
): Promise<{ code: string; warehouseId: string }> {
  const code = randomMunicipalityCode();

  await manager.query(
    `INSERT INTO municipalities (code, name, department_code, department_name, latitude, longitude, is_metro_area)
     VALUES ($1, 'Finalize Transaction Concurrency Test Municipality', '00', 'Test Department', $2, $3, false)`,
    [code, FIXTURE_LATITUDE, FIXTURE_LONGITUDE],
  );

  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO warehouses (name, municipality_code, address, latitude, longitude)
     VALUES ('Finalize Transaction Concurrency Test Warehouse', $1, 'Integration test address', $2, $3)
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
    recipientName: 'Finalize Concurrency Test Recipient',
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

// Same stay-pending double as finalize-transaction.int-spec.ts: it leaves
// the reserved transaction PENDING with an AWAITING_PAYMENT delivery, ready
// for this file's finalize() calls to race.
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

// Same small counting double as finalize-transaction.int-spec.ts (file-local
// there, so replicated here rather than imported).
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

describe('FinalizeTransactionUseCase concurrency (real UnitOfWork + real repositories, fake gateway)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let createTransactionUseCase: CreateTransactionUseCase;
  let getQuoteUseCase: GetQuoteUseCase;
  let eventPublisher: CountingEventPublisher;
  let finalizeUseCases: FinalizeTransactionUseCase[];
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
    getQuoteUseCase = moduleRef.get(GetQuoteUseCase, { strict: false });

    // The setup step the spec asks for: the pool this DataSource opened must
    // hold at least as many connections as the 3 finalize calls this file
    // fires together, or they would queue at the pool instead of racing at
    // Postgres.
    const configuredPoolMax = (dataSource.options as { extra?: { max?: number } }).extra?.max;
    expect(configuredPoolMax).toBeDefined();
    expect(configuredPoolMax as number).toBeGreaterThanOrEqual(CONCURRENT_FINALIZES);

    // The 3 stateless collaborators every finalize call shares (they take
    // `TxContext` as a parameter and hold no per-call connection state), but
    // each of the 3 `FinalizeTransactionUseCase` instances below gets its
    // own freshly-constructed `TypeOrmUnitOfWork(dataSource)` — never one
    // shared across the 3 calls, per the spec's Risks-table mitigation.
    const transactionRepository = moduleRef.get<TransactionRepository>(TRANSACTION_REPOSITORY, {
      strict: false,
    });
    const stockReservation = moduleRef.get<StockReservationPort>(STOCK_RESERVATION, {
      strict: false,
    });
    const deliveryRepository = moduleRef.get<DeliveryRepository>(DELIVERY_REPOSITORY, {
      strict: false,
    });
    const clock = moduleRef.get<Clock>(CLOCK, { strict: false });

    finalizeUseCases = Array.from({ length: CONCURRENT_FINALIZES }, () => {
      const deps: FinalizeTransactionDependencies = {
        transactionRepository,
        stockReservation,
        deliveryRepository,
        unitOfWork: new TypeOrmUnitOfWork(dataSource),
        clock,
        eventPublisher,
      };
      return new FinalizeTransactionUseCase(deps);
    });

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
  // already opens — same helper as finalize-transaction.int-spec.ts.
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

  it('3 concurrent APPROVED finalizations: exactly 1 FINALIZED and 2 ALREADY_FINAL, stock 8/0, delivery READY_TO_SHIP, 1 event', async () => {
    const { productId, transactionId, deliveryId } = await setupPendingTransaction(
      { stockAvailable: 10, stockReserved: 0 },
      2,
    );

    try {
      // The 3 calls are kicked off together — `.map` starts every promise
      // before `Promise.all` is reached, so none of them is awaited before
      // the next one starts. Each call runs through its OWN
      // `FinalizeTransactionUseCase` instance, each with its OWN
      // `TypeOrmUnitOfWork`, so the 3 `transactions.finalize` UPDATEs
      // genuinely race at the database, each on its own pooled connection.
      const statusMessage = 'Approved by the gateway';
      const calls = finalizeUseCases.map((useCase) =>
        useCase.execute({
          id: transactionId,
          status: 'APPROVED',
          statusMessage,
        }),
      );

      const results = await Promise.all(calls);
      const outcomes: FinalizeTransactionResult[] = results.map((result) => result._unsafeUnwrap());

      const finalizedCount = outcomes.filter((outcome) => outcome === 'FINALIZED').length;
      const alreadyFinalCount = outcomes.filter((outcome) => outcome === 'ALREADY_FINAL').length;

      expect(finalizedCount).toBe(1);
      expect(alreadyFinalCount).toBe(CONCURRENT_FINALIZES - 1);

      const stock = await fetchProductStock(dataSource.manager, productId);
      expect(stock.available).toBe(8);
      expect(stock.reserved).toBe(0);

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
});
