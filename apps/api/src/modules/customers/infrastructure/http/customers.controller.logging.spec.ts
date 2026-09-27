import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Customer } from '@checkout/shared/contracts';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import request from 'supertest';

import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { UNIT_OF_WORK } from '../../../../shared/application/ports/unit-of-work.port';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import {
  REDACT_CENSOR,
  REDACT_PATHS,
} from '../../../../shared/infrastructure/logging/redact-paths';
import { CUSTOMER_REPOSITORY } from '../../application/ports/customer.repository.port';
import type {
  CustomerRepository,
  CustomerUniqueViolation,
  NewCustomer,
} from '../../application/ports/customer.repository.port';
import { GetCustomerUseCase } from '../../application/use-cases/get-customer.use-case';
import { UpsertCustomerUseCase } from '../../application/use-cases/upsert-customer.use-case';
import { CustomersController } from './customers.controller';

const DOC = '1017234567';
const NAME = 'Ana Pérez';
const EMAIL = 'ana@mail.com';
const PHONE = '3001234567';

// Same in-memory double as customers.controller.spec.ts, duplicated on
// purpose: this spec's only concern is what the logger writes, not the
// upsert/conflict behavior already covered elsewhere.
class FakeCustomerRepository implements CustomerRepository {
  private readonly customers: Customer[] = [];

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
    const inserted: Customer = { id: randomUUID(), ...customer };
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
}

class FakeUnitOfWork implements UnitOfWork {
  private readonly tx: TxContext = { __brand: 'TxContext' };

  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> {
    return work(this.tx);
  }
}

// Minimal in-memory pino DestinationStream: pino only ever calls write()
// with the serialized line, so collecting the raw chunks is enough to
// inspect everything that got logged for a request.
class MemoryStream implements DestinationStream {
  private readonly chunks: string[] = [];

  write(chunk: string): void {
    this.chunks.push(chunk);
  }

  contents(): string {
    return this.chunks.join('');
  }
}

async function buildApp(stream: MemoryStream): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      LoggerModule.forRoot({
        pinoHttp: {
          stream,
          redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
        },
      }),
    ],
    controllers: [CustomersController],
    providers: [
      UpsertCustomerUseCase,
      GetCustomerUseCase,
      { provide: CUSTOMER_REPOSITORY, useClass: FakeCustomerRepository },
      { provide: UNIT_OF_WORK, useClass: FakeUnitOfWork },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useLogger(app.get(PinoLogger));
  configureApp(app);
  await app.init();
  return app;
}

function validBody(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return { documentNumber: DOC, fullName: NAME, email: EMAIL, phone: PHONE, ...overrides };
}

// nestjs-pino keeps its pino-http middleware in a module-level singleton
// (`rootLogger.ts`: "built once, whoever gets there first") that is not
// reset between `LoggerModule.forRoot()` calls within the same test file.
// A second app built with a second stream would silently keep writing to
// the first app's stream instead of its own. One shared app + stream per
// describe block sidesteps that, and matches how the real process runs:
// one app, one root logger, for its whole lifetime.
describe('CustomersController logging', () => {
  let app: INestApplication;
  let server: Server;
  let stream: MemoryStream;

  beforeAll(async () => {
    stream = new MemoryStream();
    app = await buildApp(stream);
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('never logs the raw document number, email or phone on a successful POST /customers', async () => {
    const response = await request(server).post('/api/v1/customers').send(validBody());
    expect(response.status).toBe(201);

    const logged = stream.contents();
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(DOC);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(PHONE);
  });

  it('never logs the raw document number, email or phone on a 409 conflict', async () => {
    // Reuses the customer created by the previous test: same document,
    // different email, which is exactly what CUSTOMER_DATA_MISMATCH needs.
    const conflict = await request(server)
      .post('/api/v1/customers')
      .send(validBody({ email: 'otra@mail.com' }));
    expect(conflict.status).toBe(409);

    const logged = stream.contents();
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(DOC);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain('otra@mail.com');
    expect(logged).not.toContain(PHONE);
  });
});
