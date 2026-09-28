import { createHash, randomUUID } from 'node:crypto';

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
import type { Result, ResultAsync } from '../../../../shared/domain/result';
import { errAsync, ok, okAsync } from '../../../../shared/domain/result';
import { buildDataSourceOptions } from '../../../../shared/infrastructure/persistence/data-source';
import { GetQuoteUseCase } from '../../../pricing';
// This file lives in notifications/, so any transactions/ type or class must
// cross through the module's own index.ts, never a deep path (see
// references/layering.md). TransactionsModule itself is not imported here:
// NotificationsModule already imports it (notifications.module.ts), which is
// enough to wire CreateTransactionUseCase and FinalizeTransactionUseCase into
// this testing module's container — moduleRef.get(..., { strict: false })
// below finds them by a container-wide lookup, the same technique
// finalize-transaction.int-spec.ts uses for its own unexported providers.
import type {
  CreateTransactionCommand,
  GatewayCharge,
  PaymentGatewayError,
  PaymentGatewayPort,
} from '../../../transactions';
import {
  CreateTransactionUseCase,
  FinalizeTransactionUseCase,
  PAYMENT_GATEWAY,
} from '../../../transactions';
import type { EmailSendError, EmailSender } from '../../application/ports/email-sender.port';
import { EMAIL_SENDER } from '../../application/ports/email-sender.port';
import { SendTransactionEmailUseCase } from '../../application/use-cases/send-transaction-email.use-case';
import { NotificationsModule } from '../../notifications.module';

// Proves the check-send-mark flow against real Postgres: the REAL
// SendTransactionEmailUseCase, its REAL repositories (through
// NotificationsModule -> TransactionsModule/CustomersModule/CatalogModule/
// DeliveriesModule) and the REAL TypeOrmUnitOfWork — only EMAIL_SENDER and
// PAYMENT_GATEWAY are swapped for local doubles, exactly like
// finalize-transaction.int-spec.ts swaps EVENT_PUBLISHER and PAYMENT_GATEWAY.
// Lives under infrastructure/persistence/ (not application/use-cases/, where
// the spec's file map groups it): that ESLint boundary bans typeorm and
// infrastructure/ imports from application/, and this file needs both
// (TypeOrmModule.forRoot, DataSource) — the same reason
// finalize-transaction.int-spec.ts sits under transactions'
// infrastructure/persistence/.
const POOL_MAX = 10;

function randomDocumentNumber(): string {
  return String(1_000_000 + Math.floor(Math.random() * 8_999_999));
}

function randomPhone(): string {
  const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `3${suffix}`;
}

function randomMunicipalityCode(): string {
  const suffix = String(100 + Math.floor(Math.random() * 900));
  return `00${suffix}`;
}

async function insertCustomer(manager: EntityManager): Promise<{ id: string; email: string }> {
  const email = `${randomUUID()}@example.com`;
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO customers (document_number, email, full_name, phone)
     VALUES ($1, $2, 'Send Transaction Email Int Test Customer', $3)
     RETURNING id`,
    [randomDocumentNumber(), email, randomPhone()],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test customer');
  return { id, email };
}

async function insertProduct(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO products (sku, name, brand, description, price_cents, image_url, stock_available, stock_reserved)
     VALUES ($1, 'Send Transaction Email Int Test Product', 'Test Brand', 'Integration test description', 100000, '/images/products/test-640.webp', 10, 0)
     RETURNING id`,
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`],
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
  const code = randomMunicipalityCode();

  await manager.query(
    `INSERT INTO municipalities (code, name, department_code, department_name, latitude, longitude, is_metro_area)
     VALUES ($1, 'Send Transaction Email Int Test Municipality', '00', 'Test Department', $2, $3, false)`,
    [code, FIXTURE_LATITUDE, FIXTURE_LONGITUDE],
  );

  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO warehouses (name, municipality_code, address, latitude, longitude)
     VALUES ('Send Transaction Email Int Test Warehouse', $1, 'Integration test address', $2, $3)
     RETURNING id`,
    [code, FIXTURE_LATITUDE + 0.0001, FIXTURE_LONGITUDE + 0.0001],
  );
  const warehouseId = rows[0]?.id;
  if (!warehouseId) throw new Error('Failed to insert test warehouse');

  return { code, warehouseId };
}

async function softDeleteProduct(manager: EntityManager, productId: string): Promise<void> {
  await manager.query('UPDATE products SET deleted_at = now() WHERE id = $1', [productId]);
}

async function fetchEmailSentAt(
  manager: EntityManager,
  transactionId: string,
): Promise<Date | null> {
  const rows: Array<{ email_sent_at: Date | null }> = await manager.query(
    'SELECT email_sent_at FROM transactions WHERE id = $1',
    [transactionId],
  );
  return rows[0]?.email_sent_at ?? null;
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
    recipientName: 'Send Transaction Email Test Recipient',
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
    // A fresh randomUUID idempotencyKey per test means this is never compared
    // against a stored hash (see create-transaction.use-case.ts's replay
    // check) — the real algorithm (domain/request-hash.ts) is transactions/
    // internal and off-limits to a cross-module import.
    requestHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    customerId: params.customerId,
    productId: params.productId,
    quantity: params.quantity,
    installments: 1,
    expectedTotalInCents: params.expectedTotalInCents,
    payment,
    delivery,
  };
}

// Same async-gateway double as finalize-transaction.int-spec.ts: leaves the
// reserved transaction PENDING with an AWAITING_PAYMENT delivery, ready for
// this file's finalize() calls to resolve to APPROVED.
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

// Captures every send, and can be toggled to fail so the spec can prove a
// send failure leaves email_sent_at untouched and a later send recovers it.
class CapturingEmailSender implements EmailSender {
  readonly sent: { to: string; subject: string }[] = [];
  private failing = false;

  failNextSends(): void {
    this.failing = true;
  }

  recover(): void {
    this.failing = false;
  }

  send(message: { to: string; subject: string }): ResultAsync<void, EmailSendError> {
    if (this.failing) {
      return errAsync({ message: 'SMTP down' });
    }
    this.sent.push({ to: message.to, subject: message.subject });
    return okAsync(undefined);
  }
}

// Same reason as finalize-transaction.int-spec.ts: TransactionsModule
// registers PaymentWebhookController, which injects APP_CONFIG directly, and
// the CI job that runs test:int sets only the db group of env vars. Supplying
// APP_CONFIG locally avoids needing the full .env here too.
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
    messaging: { driver: 'memory', queueUrl: null },
    email: { driver: 'log' },
    web: { publicUrl: null },
  };
}

@Global()
@Module({ providers: [{ provide: APP_CONFIG, useValue: fakeAppConfig() }], exports: [APP_CONFIG] })
class FakeConfigModule {}

describe('SendTransactionEmailUseCase against Postgres (real UnitOfWork + real repositories)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let createTransactionUseCase: CreateTransactionUseCase;
  let finalizeTransactionUseCase: FinalizeTransactionUseCase;
  let sendTransactionEmailUseCase: SendTransactionEmailUseCase;
  let getQuoteUseCase: GetQuoteUseCase;
  let emailSender: CapturingEmailSender;
  let municipalityCode: string;
  let warehouseId: string;

  beforeAll(async () => {
    emailSender = new CapturingEmailSender();

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...buildDataSourceOptions(loadDbConfig()),
          extra: { max: POOL_MAX },
        }),
        FakeConfigModule,
        NotificationsModule,
      ],
    })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(new StayPendingPaymentGateway())
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .compile();

    await moduleRef.init();

    dataSource = moduleRef.get(DataSource, { strict: false });
    createTransactionUseCase = moduleRef.get(CreateTransactionUseCase, { strict: false });
    finalizeTransactionUseCase = moduleRef.get(FinalizeTransactionUseCase, { strict: false });
    sendTransactionEmailUseCase = moduleRef.get(SendTransactionEmailUseCase, { strict: false });
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
    emailSender.sent.length = 0;
    emailSender.recover();
  });

  async function setupFinalizedTransaction(): Promise<{
    productId: string;
    transactionId: string;
    customerEmail: string;
  }> {
    const customer = await insertCustomer(dataSource.manager);
    const productId = await insertProduct(dataSource.manager);

    const quote = (
      await getQuoteUseCase.execute({ productId, quantity: 1, municipalityCode })
    )._unsafeUnwrap();

    const cmd = buildCommand({
      idempotencyKey: randomUUID(),
      customerId: customer.id,
      productId,
      quantity: 1,
      expectedTotalInCents: quote.totalInCents,
      municipalityCode,
    });

    const created = (await createTransactionUseCase.execute(cmd))._unsafeUnwrap();
    const transactionId = created.view.id;

    const finalized = await finalizeTransactionUseCase.execute({
      id: transactionId,
      status: 'APPROVED',
      statusMessage: 'Approved by the gateway',
    });
    expect(finalized._unsafeUnwrap()).toBe('FINALIZED');

    return { productId, transactionId, customerEmail: customer.email };
  }

  it('sends exactly one email and sets email_sent_at on the first execute', async () => {
    const { productId, transactionId, customerEmail } = await setupFinalizedTransaction();

    try {
      const result = await sendTransactionEmailUseCase.execute(transactionId);

      expect(result._unsafeUnwrap()).toBe('SENT');
      expect(emailSender.sent).toHaveLength(1);
      expect(emailSender.sent[0]?.to).toBe(customerEmail);

      const emailSentAt = await fetchEmailSentAt(dataSource.manager, transactionId);
      expect(emailSentAt).not.toBeNull();
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('sends only one email across two executes', async () => {
    const { productId, transactionId } = await setupFinalizedTransaction();

    try {
      const first = await sendTransactionEmailUseCase.execute(transactionId);
      const second = await sendTransactionEmailUseCase.execute(transactionId);

      expect(first._unsafeUnwrap()).toBe('SENT');
      expect(second._unsafeUnwrap()).toBe('ALREADY_SENT');
      expect(emailSender.sent).toHaveLength(1);
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });

  it('a failing sender leaves email_sent_at null, and a later execute with a working sender sends it', async () => {
    const { productId, transactionId } = await setupFinalizedTransaction();

    try {
      emailSender.failNextSends();
      const failed = await sendTransactionEmailUseCase.execute(transactionId);

      expect(failed.isErr()).toBe(true);
      expect(emailSender.sent).toHaveLength(0);

      const emailSentAtAfterFailure = await fetchEmailSentAt(dataSource.manager, transactionId);
      expect(emailSentAtAfterFailure).toBeNull();

      emailSender.recover();
      const retried = await sendTransactionEmailUseCase.execute(transactionId);

      expect(retried._unsafeUnwrap()).toBe('SENT');
      expect(emailSender.sent).toHaveLength(1);

      const emailSentAtAfterRetry = await fetchEmailSentAt(dataSource.manager, transactionId);
      expect(emailSentAtAfterRetry).not.toBeNull();
    } finally {
      await softDeleteProduct(dataSource.manager, productId);
    }
  });
});
