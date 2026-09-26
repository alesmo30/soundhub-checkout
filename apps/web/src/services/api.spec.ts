import { HttpResponse, http } from 'msw';

import { makeStore } from '@/app/store';
import { server } from '@/mocks/server';

import { api, getErrorCode, isProblemDetails } from './api';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const testApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getTestThing: builder.query<{ ok: boolean }, void>({
      query: () => 'test-endpoint',
    }),
  }),
});

describe('isProblemDetails', () => {
  it('accepts an object with a numeric status and a data.code string', () => {
    expect(isProblemDetails({ status: 409, data: { code: 'OUT_OF_STOCK' } })).toBe(true);
  });

  it.each([
    ['a primitive', 'nope'],
    ['null', null],
    ['a non-numeric status', { status: 'FETCH_ERROR', data: {} }],
    ['a missing status', { data: {} }],
    ['a missing data field', { status: 409 }],
    ['a non-object data field', { status: 409, data: 'nope' }],
    ['a data field without a code', { status: 409, data: {} }],
    ['a data field with a non-string code', { status: 409, data: { code: 1 } }],
  ])('rejects %s', (_label, value) => {
    expect(isProblemDetails(value)).toBe(false);
  });
});

describe('getErrorCode', () => {
  it('returns the code from a problem details error', () => {
    expect(getErrorCode({ status: 409, data: { code: 'OUT_OF_STOCK' } })).toBe('OUT_OF_STOCK');
  });

  it('returns null for anything that is not problem details', () => {
    expect(getErrorCode({ status: 'FETCH_ERROR', error: 'network down' })).toBeNull();
  });
});

describe('api base query', () => {
  it('sends a UUID v4 X-Request-Id header on every request', async () => {
    let receivedHeader: string | null = null;

    server.use(
      http.get('*/api/v1/test-endpoint', ({ request }) => {
        receivedHeader = request.headers.get('X-Request-Id');

        return HttpResponse.json({ ok: true });
      }),
    );

    const store = makeStore();

    await store.dispatch(testApi.endpoints.getTestThing.initiate());

    expect(receivedHeader).toMatch(UUID_V4_PATTERN);
  });

  it('surfaces a 409 OUT_OF_STOCK problem+json response through getErrorCode', async () => {
    server.use(
      http.get('*/api/v1/test-endpoint', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Out of stock',
            status: 409,
            code: 'OUT_OF_STOCK',
            detail: 'Not enough stock',
            traceId: 'trace-1',
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );

    const store = makeStore();

    const result = await store.dispatch(testApi.endpoints.getTestThing.initiate());

    expect(getErrorCode(result.error)).toBe('OUT_OF_STOCK');
  });

  it('returns null from getErrorCode for a network error', async () => {
    server.use(http.get('*/api/v1/test-endpoint', () => HttpResponse.error()));

    const store = makeStore();

    const result = await store.dispatch(testApi.endpoints.getTestThing.initiate());

    expect(getErrorCode(result.error)).toBeNull();
  });
});
