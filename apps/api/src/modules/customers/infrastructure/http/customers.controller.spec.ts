import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Customer, ProblemDetails } from '@checkout/shared/contracts';
import request from 'supertest';

import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import { CUSTOMER_REPOSITORY } from '../../application/ports/customer.repository.port';
import type {
  CustomerRepository,
  CustomerUniqueViolation,
  NewCustomer,
} from '../../application/ports/customer.repository.port';
import { GetCustomerUseCase } from '../../application/use-cases/get-customer.use-case';
import { UpsertCustomerUseCase } from '../../application/use-cases/upsert-customer.use-case';
import { UNIT_OF_WORK } from '../../../../shared/application/ports/unit-of-work.port';
import { CustomersController } from './customers.controller';

const DOC = '1017234567';
const NAME = 'Ana Pérez';
const EMAIL = 'ana@mail.com';
const PHONE = '3001234567';

// In-memory double for CustomerRepository, mirroring the fake used by
// upsert-customer.use-case.spec.ts. It is duplicated rather than shared
// because each spec owns its own fixtures (see references/coding-conventions.md#c3).
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

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [CustomersController],
    providers: [
      UpsertCustomerUseCase,
      GetCustomerUseCase,
      { provide: CUSTOMER_REPOSITORY, useClass: FakeCustomerRepository },
      { provide: UNIT_OF_WORK, useClass: FakeUnitOfWork },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

function asProblem(body: unknown): ProblemDetails {
  return body as ProblemDetails;
}

function asCustomerBody(body: unknown): { data: Customer } {
  return body as { data: Customer };
}

function validBody(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return { documentNumber: DOC, fullName: NAME, email: EMAIL, phone: PHONE, ...overrides };
}

describe('CustomersController', () => {
  describe('POST /customers', () => {
    let app: INestApplication;
    let server: Server;

    beforeEach(async () => {
      app = await buildApp();
      server = app.getHttpServer() as Server;
    });

    afterEach(async () => {
      await app.close();
    });

    it('returns 201 the first time and 200 for the same body afterwards', async () => {
      const first = await request(server).post('/api/v1/customers').send(validBody());
      expect(first.status).toBe(201);
      expect(asCustomerBody(first.body).data.documentNumber).toBe(DOC);

      const second = await request(server).post('/api/v1/customers').send(validBody());
      expect(second.status).toBe(200);
      expect(asCustomerBody(second.body).data.email).toBe(EMAIL);
    });

    it('sets Cache-Control: no-store on the 201', async () => {
      const response = await request(server).post('/api/v1/customers').send(validBody());

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('sets Cache-Control: no-store on the 200', async () => {
      await request(server).post('/api/v1/customers').send(validBody());
      const response = await request(server).post('/api/v1/customers').send(validBody());

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('stores and returns "  Ana@Mail.COM " as ana@mail.com', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ email: '  Ana@Mail.COM ' }));

      expect(response.status).toBe(201);
      expect(asCustomerBody(response.body).data.email).toBe('ana@mail.com');
    });

    it('returns 409 EMAIL_ALREADY_REGISTERED when a new document reuses another email', async () => {
      await request(server).post('/api/v1/customers').send(validBody());

      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ documentNumber: '1017234568', fullName: 'Bruno Ríos' }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(409);
      expect(problem.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('returns 409 CUSTOMER_DATA_MISMATCH when the document exists with a different email', async () => {
      await request(server).post('/api/v1/customers').send(validBody());

      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ email: 'otra@mail.com' }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(409);
      expect(problem.code).toBe('CUSTOMER_DATA_MISMATCH');
    });

    it('returns 400 with errors[] for a malformed documentNumber', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ documentNumber: 'abc' }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'documentNumber' })]),
      );
    });

    it('returns 400 with errors[] for an empty fullName', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ fullName: '' }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'fullName' })]),
      );
    });

    it('returns 400 with errors[] for a fullName over the max length', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ fullName: 'a'.repeat(121) }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'fullName' })]),
      );
    });

    it('returns 400 with errors[] for an invalid email', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ email: 'not-an-email' }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
      );
    });

    it('returns 400 with errors[] for a malformed phone', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ phone: '1234567890' }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'phone' })]),
      );
    });

    it('returns 400 for an unknown field such as id', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ id: 'ignored-id' }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 with errors[] for a missing field', async () => {
      const withoutPhone = validBody();
      delete withoutPhone.phone;

      const response = await request(server).post('/api/v1/customers').send(withoutPhone);

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'phone' })]),
      );
    });

    it('returns 400 with errors[] for a non-string field value (no trim to run)', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ phone: 3001234567 }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'phone' })]),
      );
    });

    it('returns 400 with errors[] for a non-string email value (no trim/lowercase to run)', async () => {
      const response = await request(server)
        .post('/api/v1/customers')
        .send(validBody({ email: 12345 }));

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
      );
    });
  });

  describe('GET /customers/:id', () => {
    let app: INestApplication;
    let server: Server;

    beforeEach(async () => {
      app = await buildApp();
      server = app.getHttpServer() as Server;
    });

    afterEach(async () => {
      await app.close();
    });

    it('returns 200 with the customer and Cache-Control: no-store', async () => {
      const created = await request(server).post('/api/v1/customers').send(validBody());
      const id = asCustomerBody(created.body).data.id;

      const response = await request(server).get(`/api/v1/customers/${id}`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(asCustomerBody(response.body).data.id).toBe(id);
    });

    it('returns 400 for a non-uuid id', async () => {
      const response = await request(server).get('/api/v1/customers/abc');

      const problem = asProblem(response.body);
      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'id' })]),
      );
    });

    it('returns 404 CUSTOMER_NOT_FOUND for an unknown uuid', async () => {
      const response = await request(server).get(
        '/api/v1/customers/00000000-0000-4000-8000-000000000000',
      );

      const problem = asProblem(response.body);
      expect(response.status).toBe(404);
      expect(problem.code).toBe('CUSTOMER_NOT_FOUND');
    });
  });
});
