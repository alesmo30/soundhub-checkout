import type {
  ApiResponse,
  ProblemDetails,
  TransactionCreated,
  TransactionView,
} from '@checkout/shared/contracts';

import { env } from '@/config/env';

import { transactionCreatedFixture, transactionViewFixture } from '../fixtures/transaction';

describe('transactions handlers', () => {
  it('returns 201 PENDING with a Location header on POST /transactions', async () => {
    const response = await fetch(`${env.apiBaseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as ApiResponse<TransactionCreated>;

    expect(response.status).toBe(201);
    expect(body.data.status).toBe('PENDING');
    expect(response.headers.get('Location')).toBe(
      `/api/v1/transactions/${transactionCreatedFixture.id}`,
    );
  });

  it('returns APPROVED with the card brand and last4 on GET /transactions/:id', async () => {
    const response = await fetch(`${env.apiBaseUrl}/transactions/${transactionViewFixture.id}`);
    const body = (await response.json()) as ApiResponse<TransactionView>;

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('APPROVED');
    expect(body.data.card).toEqual({ brand: 'VISA', last4: '4242' });
  });

  it('returns 404 TRANSACTION_NOT_FOUND for an unknown id', async () => {
    const response = await fetch(`${env.apiBaseUrl}/transactions/does-not-exist`);
    const body = (await response.json()) as ProblemDetails;

    expect(response.status).toBe(404);
    expect(body.code).toBe('TRANSACTION_NOT_FOUND');
  });
});
