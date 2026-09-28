import type {
  ApiResponse,
  ProblemDetails,
  TransactionCreated,
  TransactionView,
} from '@checkout/shared/contracts';

import { env } from '@/config/env';

import {
  transactionApprovedFixture,
  transactionDeclinedFixture,
  transactionDeclinedProgressingId,
  transactionErrorFixture,
  transactionExpiredFixture,
  transactionPendingFixture,
  transactionProgressingId,
  transactionVoidedFixture,
} from '../fixtures/transaction';

function postTransaction(cardToken: string) {
  return fetch(`${env.apiBaseUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment: { cardToken } }),
  });
}

function getTransaction(id: string) {
  return fetch(`${env.apiBaseUrl}/transactions/${id}`);
}

describe('POST /transactions', () => {
  it('returns 201 PENDING for the progressing id on a card 4242 token', async () => {
    const response = await postTransaction('tok_test_4242');
    const body = (await response.json()) as ApiResponse<TransactionCreated>;

    expect(response.status).toBe(201);
    expect(body.data.status).toBe('PENDING');
    expect(body.data.id).toBe(transactionProgressingId);
    expect(response.headers.get('Location')).toBe(
      `/api/v1/transactions/${transactionProgressingId}`,
    );
  });

  it('returns 201 PENDING for the declined-progressing id on a card 4111 token', async () => {
    const response = await postTransaction('tok_test_4111');
    const body = (await response.json()) as ApiResponse<TransactionCreated>;

    expect(response.status).toBe(201);
    expect(body.data.status).toBe('PENDING');
    expect(body.data.id).toBe(transactionDeclinedProgressingId);
  });
});

describe('GET /transactions/:id', () => {
  it.each([
    ['APPROVED', transactionApprovedFixture],
    ['DECLINED', transactionDeclinedFixture],
    ['ERROR', transactionErrorFixture],
    ['VOIDED', transactionVoidedFixture],
    ['EXPIRED', transactionExpiredFixture],
    ['PENDING', transactionPendingFixture],
  ])('answers the fixed %s fixture for its id', async (status, fixture) => {
    const response = await getTransaction(fixture.id);
    const body = (await response.json()) as ApiResponse<TransactionView>;

    expect(response.status).toBe(200);
    expect(body.data.status).toBe(status);
    expect(body.data).toEqual(fixture);
  });

  it('answers PENDING, PENDING, then APPROVED for the progressing id, with Retry-After on the pending calls', async () => {
    const first = await getTransaction(transactionProgressingId);
    const second = await getTransaction(transactionProgressingId);
    const third = await getTransaction(transactionProgressingId);

    expect((await first.json()) as ApiResponse<TransactionView>).toMatchObject({
      data: { status: 'PENDING' },
    });
    expect(first.headers.get('Retry-After')).toBe('2');

    expect((await second.json()) as ApiResponse<TransactionView>).toMatchObject({
      data: { status: 'PENDING' },
    });
    expect(second.headers.get('Retry-After')).toBe('2');

    const thirdBody = (await third.json()) as ApiResponse<TransactionView>;

    expect(thirdBody.data.status).toBe('APPROVED');
    expect(third.headers.get('Retry-After')).toBeNull();
  });

  it('answers PENDING, PENDING, then DECLINED for the declined-progressing id', async () => {
    await getTransaction(transactionDeclinedProgressingId);
    await getTransaction(transactionDeclinedProgressingId);
    const third = await getTransaction(transactionDeclinedProgressingId);
    const thirdBody = (await third.json()) as ApiResponse<TransactionView>;

    expect(thirdBody.data.status).toBe('DECLINED');
  });

  it('returns 404 TRANSACTION_NOT_FOUND for an unknown id', async () => {
    const response = await getTransaction('does-not-exist');
    const body = (await response.json()) as ProblemDetails;

    expect(response.status).toBe(404);
    expect(body.code).toBe('TRANSACTION_NOT_FOUND');
  });
});
