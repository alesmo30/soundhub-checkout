import type {
  ApiResponse,
  Customer,
  ProblemDetails,
  UpsertCustomerRequest,
} from '@checkout/shared/contracts';

import { env } from '@/config/env';

import { customerFixture } from '../fixtures/customer';

const NEW_CUSTOMER: UpsertCustomerRequest = {
  documentNumber: '1017234567',
  fullName: 'Ana Pérez',
  email: 'ana@mail.com',
  phone: '3001234567',
};

describe('customers handlers', () => {
  it('echoes the body with a fixed id on POST /customers', async () => {
    const response = await fetch(`${env.apiBaseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(NEW_CUSTOMER),
    });
    const body = (await response.json()) as ApiResponse<Customer>;

    expect(response.status).toBe(201);
    expect(body.data).toEqual({ id: customerFixture.id, ...NEW_CUSTOMER });
  });

  it('returns the fixture customer on GET /customers/:id', async () => {
    const response = await fetch(`${env.apiBaseUrl}/customers/${customerFixture.id}`);
    const body = (await response.json()) as ApiResponse<Customer>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(customerFixture);
  });

  it('returns 404 CUSTOMER_NOT_FOUND for an unknown id', async () => {
    const response = await fetch(`${env.apiBaseUrl}/customers/does-not-exist`);
    const body = (await response.json()) as ProblemDetails;

    expect(response.status).toBe(404);
    expect(body.code).toBe('CUSTOMER_NOT_FOUND');
  });
});
