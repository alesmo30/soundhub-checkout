import { HttpResponse, http } from 'msw';

import { makeStore } from '@/app/store';
import { transactionApprovedFixture, transactionProgressingId } from '@/mocks/fixtures/transaction';
import { server } from '@/mocks/server';

import { transactionApi } from './transaction.api';

describe('getTransaction', () => {
  it('unwraps the view and reports retryAfterMs from the Retry-After header, in milliseconds', async () => {
    server.use(
      http.get(`*/api/v1/transactions/${transactionProgressingId}`, () =>
        HttpResponse.json(
          { data: transactionApprovedFixture },
          { headers: { 'Retry-After': '5' } },
        ),
      ),
    );

    const store = makeStore();

    const result = await store.dispatch(
      transactionApi.endpoints.getTransaction.initiate(transactionProgressingId),
    );

    expect(result.data).toEqual({ view: transactionApprovedFixture, retryAfterMs: 5000 });
  });

  it('reports retryAfterMs as null when the response carries no Retry-After header', async () => {
    const store = makeStore();

    const result = await store.dispatch(
      transactionApi.endpoints.getTransaction.initiate(transactionApprovedFixture.id),
    );

    expect(result.data).toEqual({ view: transactionApprovedFixture, retryAfterMs: null });
  });

  it('surfaces a TRANSACTION_NOT_FOUND 404 for an unknown id', async () => {
    const store = makeStore();

    const result = await store.dispatch(
      transactionApi.endpoints.getTransaction.initiate('99999999-9999-4999-8999-999999999999'),
    );

    expect(result.data).toBeUndefined();
    expect(result.error).toMatchObject({
      status: 404,
      data: { code: 'TRANSACTION_NOT_FOUND' },
    });
  });
});
