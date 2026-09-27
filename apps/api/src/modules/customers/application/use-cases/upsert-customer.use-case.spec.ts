import { ErrorCode } from '@checkout/shared/enums';
import type { UpsertCustomerRequest } from '@checkout/shared/contracts';

import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Customer } from '../../domain/customer';
import type {
  CustomerRepository,
  CustomerUniqueViolation,
  NewCustomer,
} from '../ports/customer.repository.port';
import { UpsertCustomerUseCase } from './upsert-customer.use-case';

const DOC_1 = '1000000001';
const DOC_2 = '1000000002';
const EMAIL_1 = 'ana@mail.com';
const EMAIL_2 = 'bruno@mail.com';
const PHONE_1 = '3000000001';
const PHONE_2 = '3000000002';
const NAME_1 = 'Ana Gómez';
const NAME_2 = 'Bruno Ríos';

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-seed',
    documentNumber: DOC_1,
    email: EMAIL_1,
    fullName: NAME_1,
    phone: PHONE_1,
    ...overrides,
  };
}

interface QueuedInsertFailure {
  readonly violation: CustomerUniqueViolation;
  readonly concurrentRow?: Customer;
}

// In-memory double for CustomerRepository. insert() normally appends to the
// store, but a test can arrange it to fail once (or twice, for the
// no-more-retries case) via failNextInsertWith, optionally dropping a
// "concurrent" row into the store as a side effect — simulating another
// transaction winning the race between this transaction's check and insert,
// deterministically and without a real race.
class FakeCustomerRepository implements CustomerRepository {
  private readonly customers: Customer[];
  private readonly insertFailures: QueuedInsertFailure[] = [];
  private nextId = 1;

  constructor(initial: Customer[] = []) {
    this.customers = [...initial];
  }

  findById(id: string): ResultAsync<Customer | null, never> {
    return okAsync(this.customers.find((customer) => customer.id === id) ?? null);
  }

  findByDocumentNumber(documentNumber: string): ResultAsync<Customer | null, never> {
    return okAsync(
      this.customers.find((customer) => customer.documentNumber === documentNumber) ?? null,
    );
  }

  findByEmail(email: string): ResultAsync<Customer | null, never> {
    return okAsync(
      this.customers.find((customer) => customer.email.toLowerCase() === email.toLowerCase()) ??
        null,
    );
  }

  insert(_tx: TxContext, customer: NewCustomer): ResultAsync<Customer, CustomerUniqueViolation> {
    const failure = this.insertFailures.shift();
    if (failure) {
      if (failure.concurrentRow) {
        this.customers.push(failure.concurrentRow);
      }
      return errAsync(failure.violation);
    }

    const inserted: Customer = { id: `customer-${this.nextId++}`, ...customer };
    this.customers.push(inserted);
    return okAsync(inserted);
  }

  updateContact(
    _tx: TxContext,
    change: { id: string; fullName: string; phone: string },
  ): ResultAsync<Customer, never> {
    const index = this.customers.findIndex((customer) => customer.id === change.id);
    const existing = this.customers[index];
    if (!existing) {
      throw new Error(`FakeCustomerRepository.updateContact: customer ${change.id} not found`);
    }

    const updated: Customer = { ...existing, fullName: change.fullName, phone: change.phone };
    this.customers[index] = updated;
    return okAsync(updated);
  }

  findByIdSync(id: string): Customer | undefined {
    return this.customers.find((customer) => customer.id === id);
  }

  failNextInsertWith(violation: CustomerUniqueViolation, concurrentRow?: Customer): void {
    this.insertFailures.push({ violation, concurrentRow });
  }
}

class FakeUnitOfWork implements UnitOfWork {
  private readonly tx: TxContext = { __brand: 'TxContext' };

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    return work(this.tx);
  }
}

function buildCommand(overrides: Partial<UpsertCustomerRequest> = {}): UpsertCustomerRequest {
  return { documentNumber: DOC_1, fullName: NAME_1, email: EMAIL_1, phone: PHONE_1, ...overrides };
}

describe('UpsertCustomerUseCase', () => {
  it('creates a new customer when the document is new and the email is free', async () => {
    const repository = new FakeCustomerRepository();
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    const result = await useCase.execute(buildCommand());
    const { customer, created } = result._unsafeUnwrap();

    expect(created).toBe(true);
    expect(customer.documentNumber).toBe(DOC_1);
    expect(customer.email).toBe(EMAIL_1);
  });

  it('rejects with EMAIL_ALREADY_REGISTERED when a new document reuses another customer email', async () => {
    const existing = buildCustomer({ id: 'customer-1', documentNumber: DOC_1, email: EMAIL_1 });
    const repository = new FakeCustomerRepository([existing]);
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    const result = await useCase.execute(
      buildCommand({ documentNumber: DOC_2, fullName: NAME_2, email: EMAIL_1, phone: PHONE_2 }),
    );
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
    expect(error.kind).toBe('CONFLICT');
  });

  it('updates fullName and phone when the document exists with the same email, case-insensitively', async () => {
    const existing = buildCustomer({
      id: 'customer-1',
      documentNumber: DOC_1,
      email: EMAIL_1,
      fullName: 'Old Name',
      phone: 'old-phone',
    });
    const repository = new FakeCustomerRepository([existing]);
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    const result = await useCase.execute(
      buildCommand({ email: EMAIL_1.toUpperCase(), fullName: NAME_1, phone: PHONE_1 }),
    );
    const { customer, created } = result._unsafeUnwrap();

    expect(created).toBe(false);
    expect(customer.id).toBe('customer-1');
    expect(customer.fullName).toBe(NAME_1);
    expect(customer.phone).toBe(PHONE_1);
    expect(customer.email).toBe(EMAIL_1);
  });

  it('rejects with CUSTOMER_DATA_MISMATCH when the document exists with a different email, without overwriting it', async () => {
    const existing = buildCustomer({
      id: 'customer-1',
      documentNumber: DOC_1,
      email: EMAIL_1,
      fullName: 'Old Name',
      phone: 'old-phone',
    });
    const repository = new FakeCustomerRepository([existing]);
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    const result = await useCase.execute(buildCommand({ email: EMAIL_2 }));
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.CUSTOMER_DATA_MISMATCH);
    expect(error.kind).toBe('CONFLICT');
    expect(repository.findByIdSync('customer-1')).toEqual(existing);
  });

  it('retries after a DOCUMENT violation and resolves as an update when the concurrent row has the same email', async () => {
    const repository = new FakeCustomerRepository();
    const concurrentRow = buildCustomer({
      id: 'concurrent-1',
      documentNumber: DOC_1,
      email: EMAIL_1,
      fullName: 'Concurrent Name',
      phone: 'concurrent-phone',
    });
    repository.failNextInsertWith({ constraint: 'DOCUMENT' }, concurrentRow);
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    const result = await useCase.execute(buildCommand());
    const { customer, created } = result._unsafeUnwrap();

    expect(created).toBe(false);
    expect(customer.id).toBe('concurrent-1');
    expect(customer.fullName).toBe(NAME_1);
    expect(customer.phone).toBe(PHONE_1);
  });

  it('retries after a DOCUMENT violation and resolves as CUSTOMER_DATA_MISMATCH when the concurrent row has a different email', async () => {
    const repository = new FakeCustomerRepository();
    const concurrentRow = buildCustomer({
      id: 'concurrent-1',
      documentNumber: DOC_1,
      email: EMAIL_2,
      fullName: 'Concurrent Name',
      phone: 'concurrent-phone',
    });
    repository.failNextInsertWith({ constraint: 'DOCUMENT' }, concurrentRow);
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    const result = await useCase.execute(buildCommand());
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.CUSTOMER_DATA_MISMATCH);
  });

  it('retries after an EMAIL violation and resolves as EMAIL_ALREADY_REGISTERED', async () => {
    const repository = new FakeCustomerRepository();
    // Between our findByEmail check and our insert, another transaction
    // registered this email under a different document.
    const concurrentRow = buildCustomer({
      id: 'concurrent-1',
      documentNumber: DOC_2,
      email: EMAIL_1,
      fullName: 'Concurrent Name',
      phone: 'concurrent-phone',
    });
    repository.failNextInsertWith({ constraint: 'EMAIL' }, concurrentRow);
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    const result = await useCase.execute(buildCommand());
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
  });

  it('rejects when insert fails with a unique-constraint violation twice in a row', async () => {
    const repository = new FakeCustomerRepository();
    repository.failNextInsertWith({ constraint: 'DOCUMENT' });
    repository.failNextInsertWith({ constraint: 'DOCUMENT' });
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    await expect(useCase.execute(buildCommand())).rejects.toThrow();
  });

  it('never leaks the document number, email or phone into an error detail', async () => {
    const existing = buildCustomer({ id: 'customer-1', documentNumber: DOC_1, email: EMAIL_1 });
    const repository = new FakeCustomerRepository([existing]);
    const useCase = new UpsertCustomerUseCase(repository, new FakeUnitOfWork());

    const mismatch = await useCase.execute(buildCommand({ email: EMAIL_2 }));
    const emailTaken = await useCase.execute(
      buildCommand({ documentNumber: DOC_2, fullName: NAME_2, email: EMAIL_1, phone: PHONE_2 }),
    );

    for (const result of [mismatch, emailTaken]) {
      const error = result._unsafeUnwrapErr();
      expect(error.detail).not.toContain(DOC_1);
      expect(error.detail).not.toContain(DOC_2);
      expect(error.detail).not.toContain(EMAIL_1);
      expect(error.detail).not.toContain(EMAIL_2);
      expect(error.detail).not.toContain(PHONE_1);
      expect(error.detail).not.toContain(PHONE_2);
    }
  });
});
