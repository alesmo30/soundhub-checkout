import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@checkout/shared/enums';
import type { UpsertCustomerRequest } from '@checkout/shared/contracts';

import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import { ResultAsync } from '../../../../shared/domain/result';
import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmUnitOfWork } from '../../../../shared/infrastructure/persistence/typeorm-unit-of-work';
import { UpsertCustomerUseCase } from '../../application/use-cases/upsert-customer.use-case';
import type {
  CustomerRepository,
  CustomerUniqueViolation,
  NewCustomer,
} from '../../application/ports/customer.repository.port';
import type { Customer } from '../../domain/customer';
import { TypeOrmCustomerRepository } from './typeorm-customer.repository';

// document_number: CHECK (document_number ~ '^[0-9]{6,10}$'); 7 random digits
// never collides with a real customer, and each test draws its own so
// concurrent commands never clash with unrelated ones.
function randomDocumentNumber(): string {
  return String(Math.floor(1_000_000 + Math.random() * 9_000_000));
}

// phone: CHECK (phone ~ '^3[0-9]{9}$').
function randomPhone(): string {
  return `3${Math.floor(100_000_000 + Math.random() * 900_000_000)}`;
}

function randomEmail(): string {
  return `race-${randomUUID()}@example.com`;
}

function buildCommand(overrides: Partial<UpsertCustomerRequest> = {}): UpsertCustomerRequest {
  return {
    documentNumber: randomDocumentNumber(),
    email: randomEmail(),
    fullName: 'Race Customer',
    phone: randomPhone(),
    ...overrides,
  };
}

// N-party barrier: every caller's `arrive()` blocks until `parties` callers
// have all called it, so it can pin two independent, already-committed reads
// right before they each try to write — the only way to force a real
// Postgres race instead of a simulated one.
function createBarrier(parties: number, timeoutMs = 5000): { arrive: () => Promise<void> } {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Barrier timed out waiting for ${parties} parties`)),
      timeoutMs,
    );
    timer.unref();
  });

  return {
    async arrive(): Promise<void> {
      arrived += 1;
      if (arrived >= parties) release();
      await Promise.race([gate, timeout]);
    },
  };
}

// Test-only decorator around the real repository: every method but `insert`
// passes straight through, so both concurrent attempts do their own
// independent reads (neither sees the other's uncommitted row). `insert` is
// where the race must become real, so it is held at the barrier until both
// attempts have finished reading and are about to write; only then do both
// INSERTs reach Postgres, which serializes them for real.
class BarrierCustomerRepository implements CustomerRepository {
  constructor(
    private readonly inner: CustomerRepository,
    private readonly barrier: ReturnType<typeof createBarrier>,
  ) {}

  findById(id: string): ResultAsync<Customer | null, never> {
    return this.inner.findById(id);
  }

  findByDocumentNumber(
    documentNumber: string,
    tx?: TxContext,
  ): ResultAsync<Customer | null, never> {
    return this.inner.findByDocumentNumber(documentNumber, tx);
  }

  findByEmail(email: string, tx?: TxContext): ResultAsync<Customer | null, never> {
    return this.inner.findByEmail(email, tx);
  }

  insert(tx: TxContext, customer: NewCustomer): ResultAsync<Customer, CustomerUniqueViolation> {
    return ResultAsync.fromSafePromise(this.barrier.arrive()).andThen(() =>
      this.inner.insert(tx, customer),
    );
  }

  updateContact(
    tx: TxContext,
    change: { id: string; fullName: string; phone: string },
  ): ResultAsync<Customer, never> {
    return this.inner.updateContact(tx, change);
  }
}

function buildUseCase(): UpsertCustomerUseCase {
  const barrier = createBarrier(2);
  const innerRepository = new TypeOrmCustomerRepository(dataSource.manager);
  const barrierRepository = new BarrierCustomerRepository(innerRepository, barrier);
  const unitOfWork = new TypeOrmUnitOfWork(dataSource);

  return new UpsertCustomerUseCase(barrierRepository, unitOfWork);
}

function expectSingle<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (!item) throw new Error('expectSingle: expected exactly one element');

  return item;
}

interface CustomerRow {
  readonly id: string;
  readonly document_number: string;
  readonly email: string;
}

async function findRowsByDocument(documentNumber: string): Promise<CustomerRow[]> {
  const rows: CustomerRow[] = await dataSource.query(
    `SELECT id, document_number, email FROM customers WHERE document_number = $1`,
    [documentNumber],
  );

  return rows;
}

describe('UpsertCustomerUseCase concurrency (real TypeOrmUnitOfWork + TypeOrmCustomerRepository)', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('same new document and same email: one created, one updated, exactly one row', async () => {
    const useCase = buildUseCase();
    const documentNumber = randomDocumentNumber();
    const email = randomEmail();
    const cmdA = buildCommand({ documentNumber, email, fullName: 'Customer A' });
    const cmdB = buildCommand({ documentNumber, email, fullName: 'Customer B' });

    const [resultA, resultB] = await Promise.all([useCase.execute(cmdA), useCase.execute(cmdB)]);

    expect(resultA.isOk()).toBe(true);
    expect(resultB.isOk()).toBe(true);
    const outcomes = [resultA, resultB].map((result) => result._unsafeUnwrap().created);
    expect(outcomes.sort()).toEqual([false, true]);

    const rows = await findRowsByDocument(documentNumber);
    expect(rows).toHaveLength(1);
  });

  it('same new document, different emails: one created, one CUSTOMER_DATA_MISMATCH, winner email unchanged', async () => {
    const useCase = buildUseCase();
    const documentNumber = randomDocumentNumber();
    const cmdA = buildCommand({ documentNumber, fullName: 'Customer A' });
    const cmdB = buildCommand({ documentNumber, fullName: 'Customer B' });

    const [resultA, resultB] = await Promise.all([useCase.execute(cmdA), useCase.execute(cmdB)]);

    const attempts = [
      { cmd: cmdA, result: resultA },
      { cmd: cmdB, result: resultB },
    ];
    const winner = expectSingle(attempts.filter(({ result }) => result.isOk()));
    const loser = expectSingle(attempts.filter(({ result }) => result.isErr()));

    expect(winner.result._unsafeUnwrap().created).toBe(true);
    expect(loser.result._unsafeUnwrapErr().code).toBe(ErrorCode.CUSTOMER_DATA_MISMATCH);

    const rows = await findRowsByDocument(documentNumber);
    const row = expectSingle(rows);
    expect(row.email.toLowerCase()).toBe(winner.cmd.email.toLowerCase());
  });

  it('two new documents, same email: one created, one EMAIL_ALREADY_REGISTERED', async () => {
    const useCase = buildUseCase();
    const email = randomEmail();
    const cmdA = buildCommand({ email, fullName: 'Customer A' });
    const cmdB = buildCommand({ email, fullName: 'Customer B' });

    const [resultA, resultB] = await Promise.all([useCase.execute(cmdA), useCase.execute(cmdB)]);

    const results = [resultA, resultB];
    const winner = expectSingle(results.filter((result) => result.isOk()));
    const loser = expectSingle(results.filter((result) => result.isErr()));

    expect(winner._unsafeUnwrap().created).toBe(true);
    expect(loser._unsafeUnwrapErr().code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
  });
});
