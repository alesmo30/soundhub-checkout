import type { Customer, CustomerRepository } from '../../../customers';
import type { Product, ProductRepository } from '../../../catalog';
import type { Delivery, DeliveryRepository } from '../../../deliveries';
import type { Transaction, TransactionRepository } from '../../../transactions';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { EmailSendError, EmailSender } from '../ports/email-sender.port';
import { SendTransactionEmailUseCase } from './send-transaction-email.use-case';

const TRANSACTION_ID = 'transaction-1';

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: TRANSACTION_ID,
    reference: 'TX-2026-000123',
    idempotencyKey: 'idem-1',
    requestHash: 'hash-1',
    customerId: 'customer-1',
    productId: 'product-1',
    quantity: 2,
    unitPriceInCents: 175_000_00,
    subtotalInCents: 350_000_00,
    baseFeeInCents: 30_000_00,
    deliveryFeeInCents: 12_046_00,
    totalInCents: 392_046_00,
    currency: 'COP',
    status: 'APPROVED',
    installments: 1,
    cardBrand: 'VISA',
    cardLast4: '4242',
    providerTransactionId: 'gw-1',
    providerStatusMessage: null,
    reservationExpiresAt: new Date('2026-09-27T12:00:00.000Z'),
    finalizedAt: new Date('2026-09-27T12:05:00.000Z'),
    emailSentAt: null,
    createdAt: new Date('2026-09-27T12:00:00.000Z'),
    updatedAt: new Date('2026-09-27T12:05:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    documentNumber: '1234567890',
    email: 'ana.gomez@example.com',
    fullName: 'Ana Gómez',
    phone: '+57 300 555 1234',
    ...overrides,
  };
}

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    sku: 'SKU-1',
    name: 'Audífonos Bluetooth',
    brand: 'SoundHub',
    description: '',
    priceInCents: 175_000_00,
    imageUrl: 'https://example.com/image.png',
    stockAvailable: 10,
    stockReserved: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDelivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 'delivery-1',
    transactionId: TRANSACTION_ID,
    warehouseId: 'warehouse-1',
    municipalityCode: '11001',
    status: 'READY_TO_SHIP',
    recipientName: 'Ana Gómez',
    phone: '+57 300 555 1234',
    addressLine: 'Calle 10 # 20-30',
    addressDetail: null,
    distanceKm: 5,
    feeRule: 'METRO_FLAT',
    createdAt: new Date('2026-09-27T12:00:00.000Z'),
    updatedAt: new Date('2026-09-27T12:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

class FakePorts {
  transaction: Transaction | null = buildTransaction();
  customer: Customer | null = buildCustomer();
  product: Product | null = buildProduct();
  delivery: Delivery | null = buildDelivery();

  // A standalone const, not a property read through `this.transactionRepository`
  // later on — a property access on a mock method trips `unbound-method`.
  readonly markEmailSentSpy = jest.fn((): ResultAsync<void, never> => {
    if (this.transaction) {
      this.transaction = { ...this.transaction, emailSentAt: new Date() };
    }
    return okAsync(undefined);
  });

  readonly transactionRepository = {
    findById: (): ResultAsync<Transaction | null, never> => okAsync(this.transaction),
    markEmailSent: this.markEmailSentSpy,
  } as unknown as TransactionRepository;

  readonly customerRepository = {
    findById: (): ResultAsync<Customer | null, never> => okAsync(this.customer),
  } as unknown as CustomerRepository;

  readonly productRepository = {
    findById: (): ResultAsync<Product | null, never> => okAsync(this.product),
  } as unknown as ProductRepository;

  readonly deliveryRepository = {
    findByTransactionId: (): ResultAsync<Delivery | null, never> => okAsync(this.delivery),
  } as unknown as DeliveryRepository;
}

class FakeEmailSender implements EmailSender {
  readonly sent: { to: string; subject: string; html: string; text: string }[] = [];
  private result: ResultAsync<void, EmailSendError> = okAsync(undefined);

  queueError(error: EmailSendError): void {
    this.result = errAsync(error);
  }

  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): ResultAsync<void, EmailSendError> {
    this.sent.push(message);
    return this.result;
  }
}

class FakeUnitOfWork implements UnitOfWork {
  readonly tx: TxContext = { __brand: 'TxContext' };
  runCount = 0;

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    this.runCount += 1;
    return work(this.tx);
  }
}

function buildUseCase(
  ports: FakePorts,
  emailSender: FakeEmailSender,
  unitOfWork: FakeUnitOfWork,
): SendTransactionEmailUseCase {
  return new SendTransactionEmailUseCase({
    transactionRepository: ports.transactionRepository,
    customerRepository: ports.customerRepository,
    productRepository: ports.productRepository,
    deliveryRepository: ports.deliveryRepository,
    emailSender,
    unitOfWork,
    publicWebUrl: null,
  });
}

describe('SendTransactionEmailUseCase', () => {
  it('returns SKIPPED without sending when the transaction is not found', async () => {
    const ports = new FakePorts();
    ports.transaction = null;
    const emailSender = new FakeEmailSender();
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    const result = await useCase.execute(TRANSACTION_ID);

    expect(result._unsafeUnwrap()).toBe('SKIPPED');
    expect(emailSender.sent).toHaveLength(0);
  });

  it('returns SKIPPED without sending when the transaction is still PENDING', async () => {
    const ports = new FakePorts();
    ports.transaction = buildTransaction({ status: 'PENDING', emailSentAt: null });
    const emailSender = new FakeEmailSender();
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    const result = await useCase.execute(TRANSACTION_ID);

    expect(result._unsafeUnwrap()).toBe('SKIPPED');
    expect(emailSender.sent).toHaveLength(0);
  });

  it('returns ALREADY_SENT without sending when emailSentAt is already set', async () => {
    const ports = new FakePorts();
    ports.transaction = buildTransaction({ emailSentAt: new Date('2026-09-27T12:10:00.000Z') });
    const emailSender = new FakeEmailSender();
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    const result = await useCase.execute(TRANSACTION_ID);

    expect(result._unsafeUnwrap()).toBe('ALREADY_SENT');
    expect(emailSender.sent).toHaveLength(0);
  });

  it('sends one email to the customer and marks it sent inside a unit of work for APPROVED', async () => {
    const ports = new FakePorts();
    const emailSender = new FakeEmailSender();
    const unitOfWork = new FakeUnitOfWork();
    const useCase = buildUseCase(ports, emailSender, unitOfWork);

    const result = await useCase.execute(TRANSACTION_ID);

    expect(result._unsafeUnwrap()).toBe('SENT');
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe('ana.gomez@example.com');
    expect(ports.markEmailSentSpy).toHaveBeenCalledTimes(1);
    expect(unitOfWork.runCount).toBe(1);
  });

  it('picks the template by the stored status, not any other input', async () => {
    const ports = new FakePorts();
    ports.transaction = buildTransaction({ status: 'DECLINED' });
    const emailSender = new FakeEmailSender();
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    await useCase.execute(TRANSACTION_ID);

    expect(emailSender.sent[0]?.subject).toContain('rechazado');
  });

  it('returns Err and never marks the email sent when the send fails', async () => {
    const ports = new FakePorts();
    const emailSender = new FakeEmailSender();
    emailSender.queueError({ message: 'SMTP down' });
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    const result = await useCase.execute(TRANSACTION_ID);

    expect(result.isErr()).toBe(true);
    expect(ports.markEmailSentSpy).not.toHaveBeenCalled();
  });

  it('returns Err without sending when the customer is missing', async () => {
    const ports = new FakePorts();
    ports.customer = null;
    const emailSender = new FakeEmailSender();
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    const result = await useCase.execute(TRANSACTION_ID);

    expect(result.isErr()).toBe(true);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('returns Err without sending when the product is missing', async () => {
    const ports = new FakePorts();
    ports.product = null;
    const emailSender = new FakeEmailSender();
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    const result = await useCase.execute(TRANSACTION_ID);

    expect(result.isErr()).toBe(true);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('returns Err without sending when the delivery is missing', async () => {
    const ports = new FakePorts();
    ports.delivery = null;
    const emailSender = new FakeEmailSender();
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    const result = await useCase.execute(TRANSACTION_ID);

    expect(result.isErr()).toBe(true);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('sends only one email across two executes after the first succeeds', async () => {
    const ports = new FakePorts();
    const emailSender = new FakeEmailSender();
    const useCase = buildUseCase(ports, emailSender, new FakeUnitOfWork());

    const first = await useCase.execute(TRANSACTION_ID);
    const second = await useCase.execute(TRANSACTION_ID);

    expect(first._unsafeUnwrap()).toBe('SENT');
    expect(second._unsafeUnwrap()).toBe('ALREADY_SENT');
    expect(emailSender.sent).toHaveLength(1);
  });
});
