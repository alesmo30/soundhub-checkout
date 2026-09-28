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
import type { Clock } from '../../../../shared/application/ports/clock.port';
import { CLOCK } from '../../../../shared/application/ports/clock.port';
import type { EventPublisher } from '../../../../shared/application/ports/event-publisher.port';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Result } from '../../../../shared/domain/result';
import { ok } from '../../../../shared/domain/result';
import { buildDataSourceOptions } from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmUnitOfWork } from '../../../../shared/infrastructure/persistence/typeorm-unit-of-work';
import { GetQuoteUseCase } from '../../../pricing';
// Same layering workaround as reconcile-transactions.int-spec.ts.
import type { GatewayCharge, PaymentGatewayError, PaymentGatewayPort } from '../..';
import { PAYMENT_GATEWAY } from '../..';
import type { CreateTransactionCommand } from '../../application/use-cases/create-transaction.use-case';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import type { FinalizeTransactionDependencies } from '../../application/use-cases/finalize-transaction.use-case';
import { FinalizeTransactionUseCase } from '../../application/use-cases/finalize-transaction.use-case';
import type { ReconcileTransactionsDependencies } from '../../application/use-cases/reconcile-transactions.use-case';
import { ReconcileTransactionsUseCase } from '../../application/use-cases/reconcile-transactions.use-case';
import { requestHash } from '../../domain/request-hash';
import type { StockReservationPort } from '../../application/ports/stock-reservation.port';
import { STOCK_RESERVATION } from '../../application/ports/stock-reservation.port';
import type { TransactionRepository } from '../../application/ports/transaction.repository.port';
import { TRANSACTION_REPOSITORY } from '../../application/ports/transaction.repository.port';
import type { DeliveryRepository } from '../../../deliveries';
import { DELIVERY_REPOSITORY } from '../../../deliveries';
import { TransactionsModule } from '../../transactions.module';

// Proves this spec's concurrency acceptance criterion: two reconciler runs
// never call the gateway for the same transaction. Same technique as
// finalize-transaction.concurrency.int-spec.ts — each run gets its OWN
// TypeOrmUnitOfWork (never shared), and a fake gateway that delays 200 ms so
// both runs are genuinely in flight together, not serialized by promise
// microtask ordering.
const POOL_MAX = 20;
const CONCURRENT_RUNS = 2;
const SYNCABLE_ROWS = 10;
const GATEWAY_DELAY_MS = 200;

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
     VALUES ($1, $2, 'Reconcile Concurrency Int Test Customer', $3)
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
     VALUES ($1, 'Reconcile Concurrency Int Test Product', 'Test Brand', 'Integration test description', 100000, '/images/products/test-640.webp', 100, 0)
     RETURNING id`,
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test product');
  return id;
}

const FIXTURE_LATITUDE = 4;
const FIXTURE_LONGITUDE = 4;

async function seedMunicipalityAndWarehouse(
  manager: EntityManager,
): Promise<{ code: string; warehouseId: string }> {
  const code = `00${100 + Math.floor(Math.random() * 900)}`;

  await manager.query(
    `INSERT INTO municipalities (code, name, department_code, department_name, latitude, longitude, is_metro_area)
     VALUES ($1, 'Reconcile Concurrency Int Test Municipality', '00', 'Test Department', $2, $3, false)`,
    [code, FIXTURE_LATITUDE, FIXTURE_LONGITUDE],
  );

  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO warehouses (name, municipality_code, address, latitude, longitude)
     VALUES ('Reconcile Concurrency Int Test Warehouse', $1, 'Integration test address', $2, $3)
     RETURNING id`,
    [code, FIXTURE_LATITUDE + 0.0001, FIXTURE_LONGITUDE + 0.0001],
  );
  const warehouseId = rows[0]?.id;
  if (!warehouseId) throw new Error('Failed to insert test warehouse');

  return { code, warehouseId };
}

async function backdateUpdatedAt(manager: EntityManager, id: string, at: Date): Promise<void> {
  await manager.query('UPDATE transactions SET updated_at = $2 WHERE id = $1', [id, at]);
}

const FAR_PAST = new Date('2020-01-01T00:00:00.000Z');

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
    recipientName: 'Reconcile Concurrency Test Recipient',
    phone: randomPhone(),
    addressLine: 'Calle 1 # 2-3',
    municipalityCode,
  };
}

function buildCommand(params: {
  idempotencyKey: string;
  customerId: string;
  productId: string;
  municipalityCode: string;
  expectedTotalInCents: number;
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

// Always PENDING, so CreateTransactionUseCase's own charge step never
// finalizes these rows itself; only the reconciler under test does.
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
    throw new Error('not used by this spec (used only to seed PENDING rows)');
  }

  findChargeByReference(): ResultAsync<GatewayCharge | null, PaymentGatewayError> {
    throw new Error('not used by this spec');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One instance per concurrent run (never shared — each run's syncPending
// task calls this independently); records every id it was asked about and
// delays before answering so both runs are genuinely in flight together.
// Not `implements PaymentGatewayPort` directly: getCharge here returns a
// plain Promise (async/await reads naturally with a real delay), adapted to
// the port's required ResultAsync shape by asPaymentGatewayPort below.
class DelayedRecordingGateway {
  readonly calledIds: string[] = [];

  ensureAvailable(): Result<void, PaymentGatewayError> {
    return ok(undefined);
  }

  createCharge(): never {
    throw new Error('not used by this spec');
  }

  async getCharge(
    providerTransactionId: string,
  ): Promise<Result<GatewayCharge, PaymentGatewayError>> {
    this.calledIds.push(providerTransactionId);
    await sleep(GATEWAY_DELAY_MS);
    return ok({
      providerTransactionId,
      status: TransactionStatus.PENDING,
      statusMessage: null,
      cardBrand: null,
      cardLast4: null,
    });
  }

  findChargeByReference(): never {
    throw new Error('not used by this spec');
  }
}

// getCharge above returns a plain Promise<Result<...>> (async/await reads
// far more naturally with a real delay than chaining ResultAsync), so it is
// wrapped once here into the PaymentGatewayPort's required ResultAsync shape.
function asPaymentGatewayPort(gateway: DelayedRecordingGateway): PaymentGatewayPort {
  return {
    ensureAvailable: () => gateway.ensureAvailable(),
    createCharge: () => gateway.createCharge(),
    getCharge: (id: string) => new ResultAsync(gateway.getCharge(id)),
    findChargeByReference: () => gateway.findChargeByReference(),
  };
}

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

describe('ReconcileTransactionsUseCase concurrency (real UnitOfWork + real repositories, fake gateway)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let createTransactionUseCase: CreateTransactionUseCase;
  let getQuoteUseCase: GetQuoteUseCase;
  let municipalityCode: string;
  let warehouseId: string;
  let gateways: DelayedRecordingGateway[];
  let reconcileUseCases: ReconcileTransactionsUseCase[];

  beforeAll(async () => {
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
      .compile();

    await moduleRef.init();

    dataSource = moduleRef.get(DataSource, { strict: false });
    createTransactionUseCase = moduleRef.get(CreateTransactionUseCase, { strict: false });
    getQuoteUseCase = moduleRef.get(GetQuoteUseCase, { strict: false });

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
    const noopEventPublisher: EventPublisher = { publish: () => okAsync(undefined) };

    gateways = Array.from({ length: CONCURRENT_RUNS }, () => new DelayedRecordingGateway());
    reconcileUseCases = gateways.map((gateway) => {
      const unitOfWork = new TypeOrmUnitOfWork(dataSource);
      const finalizeDeps: FinalizeTransactionDependencies = {
        transactionRepository,
        stockReservation,
        deliveryRepository,
        unitOfWork,
        clock,
        eventPublisher: noopEventPublisher,
      };
      const dependencies: ReconcileTransactionsDependencies = {
        transactionRepository,
        paymentGateway: asPaymentGatewayPort(gateway),
        finalizeTransactionUseCase: new FinalizeTransactionUseCase(finalizeDeps),
        unitOfWork,
        clock,
        eventPublisher: noopEventPublisher,
      };
      return new ReconcileTransactionsUseCase(dependencies);
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

  it('two concurrent runs claim disjoint rows, whose union is all seeded rows', async () => {
    const customerId = await insertCustomer(dataSource.manager);
    const productId = await insertProduct(dataSource.manager);

    const providerTransactionIds: string[] = [];
    const quote = (
      await getQuoteUseCase.execute({ productId, quantity: 1, municipalityCode })
    )._unsafeUnwrap();

    for (let i = 0; i < SYNCABLE_ROWS; i += 1) {
      const cmd = buildCommand({
        idempotencyKey: randomUUID(),
        customerId,
        productId,
        municipalityCode,
        expectedTotalInCents: quote.totalInCents,
      });
      const result = await createTransactionUseCase.execute(cmd);
      const outcome = result._unsafeUnwrap();
      await backdateUpdatedAt(dataSource.manager, outcome.view.id, FAR_PAST);

      const rows: Array<{ provider_transaction_id: string }> = await dataSource.manager.query(
        'SELECT provider_transaction_id FROM transactions WHERE id = $1',
        [outcome.view.id],
      );
      const providerTransactionId = rows[0]?.provider_transaction_id;
      if (!providerTransactionId) throw new Error('expected a provider id from createCharge');
      providerTransactionIds.push(providerTransactionId);
    }

    try {
      for (const gateway of gateways) {
        gateway.calledIds.length = 0;
      }

      await Promise.all(reconcileUseCases.map((useCase) => useCase.execute()));

      // Scoped to this run's own 10 rows in case a real Postgres still holds
      // stray rows from elsewhere (belt-and-suspenders — the finally block
      // below deletes this test's own rows so they never accumulate).
      const [firstCalledIds, secondCalledIds] = gateways.map((gateway) =>
        gateway.calledIds.filter((id) => providerTransactionIds.includes(id)),
      );
      const first = firstCalledIds ?? [];
      const second = secondCalledIds ?? [];

      const intersection = first.filter((id) => second.includes(id));
      expect(intersection).toEqual([]);

      const union = new Set([...first, ...second]);
      expect(union.size).toBe(SYNCABLE_ROWS);
    } finally {
      // Deletes this test's own rows (not just soft-deletes the product) so
      // repeated local runs never accumulate PENDING leftovers that a later
      // run's claimPendingForSync could also pick up.
      await dataSource.manager.query(
        'DELETE FROM deliveries WHERE transaction_id IN (SELECT id FROM transactions WHERE product_id = $1)',
        [productId],
      );
      await dataSource.manager.query('DELETE FROM transactions WHERE product_id = $1', [productId]);
      await dataSource.manager.query('UPDATE products SET deleted_at = now() WHERE id = $1', [
        productId,
      ]);
    }
  });
});
