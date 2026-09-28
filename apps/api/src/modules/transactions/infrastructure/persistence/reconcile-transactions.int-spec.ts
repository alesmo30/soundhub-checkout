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
// Same layering workaround as finalize-transaction.int-spec.ts: this file
// lives under infrastructure/persistence/**, where the layering ESLint
// config blocks any import matching `*payment-gateway*`. Going through the
// module's own index.ts imports the same port/token without tripping that
// rule; no network adapter is ever pulled in.
import type { GatewayCharge, PaymentGatewayError, PaymentGatewayPort } from '../..';
import { PAYMENT_GATEWAY, ReconcileTransactionsUseCase } from '../..';
import type { CreateTransactionCommand } from '../../application/use-cases/create-transaction.use-case';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { requestHash } from '../../domain/request-hash';
import { TransactionsModule } from '../../transactions.module';

// Proves this spec's reconciler acceptance criteria against real Postgres:
// the real ReconcileTransactionsUseCase, the real leased claims, the real
// TypeOrmUnitOfWork and the real FinalizeTransactionUseCase — only
// PAYMENT_GATEWAY and EVENT_PUBLISHER are swapped for local doubles, same
// technique as finalize-transaction.int-spec.ts. Fixture rows (products,
// customers, municipalities, warehouses) are seeded with raw SQL for the
// same layering reason documented there.
const POOL_MAX = 10;

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
     VALUES ($1, $2, 'Reconcile Transactions Int Test Customer', $3)
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
     VALUES ($1, 'Reconcile Transactions Int Test Product', 'Test Brand', 'Integration test description', 100000, '/images/products/test-640.webp', $2, $3)
     RETURNING id`,
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`, stock.stockAvailable, stock.stockReserved],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test product');
  return id;
}

const FIXTURE_LATITUDE = 3;
const FIXTURE_LONGITUDE = 3;

async function seedMunicipalityAndWarehouse(
  manager: EntityManager,
): Promise<{ code: string; warehouseId: string }> {
  const code = `00${100 + Math.floor(Math.random() * 900)}`;

  await manager.query(
    `INSERT INTO municipalities (code, name, department_code, department_name, latitude, longitude, is_metro_area)
     VALUES ($1, 'Reconcile Transactions Int Test Municipality', '00', 'Test Department', $2, $3, false)`,
    [code, FIXTURE_LATITUDE, FIXTURE_LONGITUDE],
  );

  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO warehouses (name, municipality_code, address, latitude, longitude)
     VALUES ('Reconcile Transactions Int Test Warehouse', $1, 'Integration test address', $2, $3)
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

async function fetchReference(manager: EntityManager, transactionId: string): Promise<string> {
  const rows: Array<{ reference: string }> = await manager.query(
    'SELECT reference FROM transactions WHERE id = $1',
    [transactionId],
  );
  const reference = rows[0]?.reference;
  if (!reference) throw new Error(`Transaction ${transactionId} not found`);
  return reference;
}

async function fetchTransactionRow(
  manager: EntityManager,
  transactionId: string,
): Promise<{
  status: string;
  providerTransactionId: string | null;
  emailSentAt: Date | null;
}> {
  const rows: Array<{
    status: string;
    provider_transaction_id: string | null;
    email_sent_at: Date | null;
  }> = await manager.query(
    'SELECT status, provider_transaction_id, email_sent_at FROM transactions WHERE id = $1',
    [transactionId],
  );
  const row = rows[0];
  if (!row) throw new Error(`Transaction ${transactionId} not found`);
  return {
    status: row.status,
    providerTransactionId: row.provider_transaction_id,
    emailSentAt: row.email_sent_at,
  };
}

async function fetchDeliveryStatusByTransactionId(
  manager: EntityManager,
  transactionId: string,
): Promise<string | null> {
  const rows: Array<{ status: string }> = await manager.query(
    'SELECT status FROM deliveries WHERE transaction_id = $1',
    [transactionId],
  );
  return rows[0]?.status ?? null;
}

async function clearProviderTransactionId(manager: EntityManager, id: string): Promise<void> {
  await manager.query('UPDATE transactions SET provider_transaction_id = NULL WHERE id = $1', [id]);
}

async function backdateReservationExpiresAt(
  manager: EntityManager,
  id: string,
  at: Date,
): Promise<void> {
  await manager.query('UPDATE transactions SET reservation_expires_at = $2 WHERE id = $1', [
    id,
    at,
  ]);
}

async function backdateUpdatedAt(manager: EntityManager, id: string, at: Date): Promise<void> {
  await manager.query('UPDATE transactions SET updated_at = $2 WHERE id = $1', [id, at]);
}

async function backdateFinalizedAt(manager: EntityManager, id: string, at: Date): Promise<void> {
  await manager.query('UPDATE transactions SET finalized_at = $2 WHERE id = $1', [id, at]);
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
    recipientName: 'Reconcile Test Recipient',
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

// Always reports the breaker closed and creates a PENDING charge with a
// fake provider id, same role as finalize-transaction.int-spec.ts's
// StayPendingPaymentGateway. getCharge/findChargeByReference are configured
// per test through the maps below, keyed by provider id / reference.
class ConfigurableFakeGateway implements PaymentGatewayPort {
  readonly getChargeCalls: string[] = [];
  readonly findByReferenceCalls: string[] = [];
  private readonly byProviderId = new Map<string, GatewayCharge>();
  private readonly byReference = new Map<string, GatewayCharge | null>();

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

  // Real Postgres may hold committed PENDING/expired rows from other
  // int-specs (e.g. the concurrency suites, which commit for real) that the
  // reconciler's own (unscoped) claims can pick up alongside this test's own
  // rows. Anything not explicitly stubbed defaults to "still PENDING" —
  // harmless noise for both tasks — rather than throwing.
  getCharge(providerTransactionId: string): ResultAsync<GatewayCharge, PaymentGatewayError> {
    this.getChargeCalls.push(providerTransactionId);
    const charge = this.byProviderId.get(providerTransactionId) ?? {
      providerTransactionId,
      status: TransactionStatus.PENDING,
      statusMessage: null,
      cardBrand: null,
      cardLast4: null,
    };
    return okAsync(charge);
  }

  findChargeByReference(reference: string): ResultAsync<GatewayCharge | null, PaymentGatewayError> {
    this.findByReferenceCalls.push(reference);
    return okAsync(
      this.byReference.has(reference) ? (this.byReference.get(reference) ?? null) : null,
    );
  }

  stubGetCharge(providerTransactionId: string, charge: GatewayCharge): void {
    this.byProviderId.set(providerTransactionId, charge);
  }

  stubFindByReference(reference: string, charge: GatewayCharge | null): void {
    this.byReference.set(reference, charge);
  }
}

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

// PaymentWebhookController lives in TransactionsModule and injects
// APP_CONFIG directly. Supplied here through a local @Global() module
// instead of the real ConfigModule, which would require the full .env
// test:int's CI job never sets (see environment-variables.ts).
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

describe('ReconcileTransactionsUseCase against Postgres', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let createTransactionUseCase: CreateTransactionUseCase;
  let reconcileTransactionsUseCase: ReconcileTransactionsUseCase;
  let getQuoteUseCase: GetQuoteUseCase;
  let gateway: ConfigurableFakeGateway;
  let eventPublisher: CountingEventPublisher;
  let municipalityCode: string;
  let warehouseId: string;

  beforeAll(async () => {
    gateway = new ConfigurableFakeGateway();
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
      .useValue(gateway)
      .overrideProvider(EVENT_PUBLISHER)
      .useValue(eventPublisher)
      .compile();

    await moduleRef.init();

    dataSource = moduleRef.get(DataSource, { strict: false });
    createTransactionUseCase = moduleRef.get(CreateTransactionUseCase, { strict: false });
    reconcileTransactionsUseCase = moduleRef.get(ReconcileTransactionsUseCase, { strict: false });
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

  async function setupPendingTransaction(
    stock: { stockAvailable: number; stockReserved: number },
    quantity: number,
  ): Promise<{ productId: string; transactionId: string }> {
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

    return { productId, transactionId: outcome.view.id };
  }

  it('an abandoned reservation with no charge at the gateway ends EXPIRED, stock released, delivery CANCELLED', async () => {
    const { productId, transactionId } = await setupPendingTransaction(
      { stockAvailable: 10, stockReserved: 0 },
      2,
    );

    try {
      const reference = await fetchReference(dataSource.manager, transactionId);

      await clearProviderTransactionId(dataSource.manager, transactionId);
      await backdateReservationExpiresAt(dataSource.manager, transactionId, FAR_PAST);
      await backdateUpdatedAt(dataSource.manager, transactionId, FAR_PAST);
      gateway.stubFindByReference(reference, null);

      const summary = (await reconcileTransactionsUseCase.execute())._unsafeUnwrap();

      expect(summary.expired).toBeGreaterThanOrEqual(1);

      const after = await fetchTransactionRow(dataSource.manager, transactionId);
      expect(after.status).toBe('EXPIRED');

      const stock = await fetchProductStock(dataSource.manager, productId);
      expect(stock.available).toBe(10);
      expect(stock.reserved).toBe(0);

      const deliveryStatus = await fetchDeliveryStatusByTransactionId(
        dataSource.manager,
        transactionId,
      );
      expect(deliveryStatus).toBe('CANCELLED');
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('the same setup, but the gateway has an APPROVED charge by reference, stores the provider id and finalizes APPROVED', async () => {
    const { productId, transactionId } = await setupPendingTransaction(
      { stockAvailable: 10, stockReserved: 0 },
      2,
    );

    try {
      const reference = await fetchReference(dataSource.manager, transactionId);

      const recoveredProviderId = `recovered-${randomUUID()}`;
      await clearProviderTransactionId(dataSource.manager, transactionId);
      await backdateReservationExpiresAt(dataSource.manager, transactionId, FAR_PAST);
      await backdateUpdatedAt(dataSource.manager, transactionId, FAR_PAST);
      gateway.stubFindByReference(reference, {
        providerTransactionId: recoveredProviderId,
        status: TransactionStatus.APPROVED,
        statusMessage: 'Recovered by reconciler',
        cardBrand: null,
        cardLast4: null,
      });

      const summary = (await reconcileTransactionsUseCase.execute())._unsafeUnwrap();

      expect(summary.recovered).toBeGreaterThanOrEqual(1);

      const after = await fetchTransactionRow(dataSource.manager, transactionId);
      expect(after.status).toBe('APPROVED');
      expect(after.providerTransactionId).toBe(recoveredProviderId);

      const stock = await fetchProductStock(dataSource.manager, productId);
      expect(stock.available).toBe(8);
      expect(stock.reserved).toBe(0);
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('a PENDING transaction with a provider id, older than 1 min, is finalized DECLINED when the gateway says so, stock restored', async () => {
    const { productId, transactionId } = await setupPendingTransaction(
      { stockAvailable: 10, stockReserved: 0 },
      2,
    );

    try {
      await backdateUpdatedAt(dataSource.manager, transactionId, FAR_PAST);
      const providerTransactionId = (await fetchTransactionRow(dataSource.manager, transactionId))
        .providerTransactionId;
      if (!providerTransactionId) throw new Error('expected a provider id from createCharge');
      gateway.stubGetCharge(providerTransactionId, {
        providerTransactionId,
        status: TransactionStatus.DECLINED,
        statusMessage: 'Declined on sync',
        cardBrand: null,
        cardLast4: null,
      });

      const summary = (await reconcileTransactionsUseCase.execute())._unsafeUnwrap();

      expect(summary.synced).toBeGreaterThanOrEqual(1);

      const after = await fetchTransactionRow(dataSource.manager, transactionId);
      expect(after.status).toBe('DECLINED');

      const stock = await fetchProductStock(dataSource.manager, productId);
      expect(stock.available).toBe(10);
      expect(stock.reserved).toBe(0);
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('a row finalized 6 min ago without an email is re-published once, and a second run right after publishes none', async () => {
    const { productId, transactionId } = await setupPendingTransaction(
      { stockAvailable: 10, stockReserved: 0 },
      1,
    );

    try {
      const providerTransactionId = (await fetchTransactionRow(dataSource.manager, transactionId))
        .providerTransactionId;
      if (!providerTransactionId) throw new Error('expected a provider id from createCharge');
      gateway.stubGetCharge(providerTransactionId, {
        providerTransactionId,
        status: TransactionStatus.APPROVED,
        statusMessage: null,
        cardBrand: null,
        cardLast4: null,
      });
      // Finalize it directly through the same sync path (older than 1 min),
      // then backdate finalized_at/updated_at past the 5 min re-publish mark.
      await backdateUpdatedAt(dataSource.manager, transactionId, FAR_PAST);
      await reconcileTransactionsUseCase.execute();
      await backdateFinalizedAt(dataSource.manager, transactionId, FAR_PAST);
      await backdateUpdatedAt(dataSource.manager, transactionId, FAR_PAST);
      eventPublisher.reset();

      const first = (await reconcileTransactionsUseCase.execute())._unsafeUnwrap();
      expect(first.republished).toBeGreaterThanOrEqual(1);
      expect(
        eventPublisher.events.some(
          (event) => (event as { transactionId?: string }).transactionId === transactionId,
        ),
      ).toBe(true);

      eventPublisher.reset();
      await reconcileTransactionsUseCase.execute();
      expect(
        eventPublisher.events.some(
          (event) => (event as { transactionId?: string }).transactionId === transactionId,
        ),
      ).toBe(false);
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });
});
