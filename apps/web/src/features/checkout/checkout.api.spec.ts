import { HttpResponse, http } from 'msw';
import type { CreateTransactionRequest } from '@checkout/shared/contracts';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from '@checkout/shared/contracts';
import { CardBrand } from '@checkout/shared/enums';

import { makeStore } from '@/app/store';
import { customerFixture } from '@/mocks/fixtures/customer';
import { departments, municipalitiesByDepartment } from '@/mocks/fixtures/locations';
import { quoteFixture } from '@/mocks/fixtures/quote';
import { transactionProgressingId } from '@/mocks/fixtures/transaction';
import { server } from '@/mocks/server';

import { checkoutApi } from './checkout.api';

const createTransactionRequestBody: CreateTransactionRequest = {
  customerId: customerFixture.id,
  productId: '11111111-1111-4111-8111-111111111101',
  quantity: 1,
  installments: 1,
  expectedTotalInCents: quoteFixture.totalInCents,
  payment: {
    cardToken: 'tok_test_4242',
    cardBrand: CardBrand.VISA,
    cardLast4: '4242',
    acceptanceToken: 'test-acceptance-token',
    personalAuthToken: 'test-personal-data-token',
  },
  delivery: {
    recipientName: 'Ana Pérez',
    phone: '3001234567',
    addressLine: 'Cra 43A # 1-50',
    municipalityCode: '05001',
  },
};

describe('getDepartments', () => {
  it('unwraps the department list from the data envelope', async () => {
    const store = makeStore();

    const result = await store.dispatch(checkoutApi.endpoints.getDepartments.initiate());

    expect(result.data).toEqual(departments);
  });
});

describe('getMunicipalities', () => {
  it('unwraps the municipality list from the data envelope', async () => {
    const store = makeStore();

    const result = await store.dispatch(checkoutApi.endpoints.getMunicipalities.initiate('05'));

    expect(result.data).toEqual(municipalitiesByDepartment['05']);
  });

  it('surfaces a DEPARTMENT_NOT_FOUND error for an unknown department', async () => {
    const store = makeStore();

    const result = await store.dispatch(checkoutApi.endpoints.getMunicipalities.initiate('99'));

    expect(result.data).toBeUndefined();
    expect(result.error).toMatchObject({ status: 404, data: { code: 'DEPARTMENT_NOT_FOUND' } });
  });
});

describe('getQuote', () => {
  it('sends productId, quantity and municipalityCode as query params and unwraps data', async () => {
    let receivedUrl: URL | undefined;

    server.use(
      http.get('*/api/v1/quotes', ({ request }) => {
        receivedUrl = new URL(request.url);

        return HttpResponse.json({ data: quoteFixture });
      }),
    );

    const store = makeStore();

    const result = await store.dispatch(
      checkoutApi.endpoints.getQuote.initiate({
        productId: 'product-1',
        quantity: 2,
        municipalityCode: '05001',
      }),
    );

    expect(receivedUrl?.searchParams.get('productId')).toBe('product-1');
    expect(receivedUrl?.searchParams.get('quantity')).toBe('2');
    expect(receivedUrl?.searchParams.get('municipalityCode')).toBe('05001');
    expect(result.data).toEqual(quoteFixture);
  });
});

describe('getAcceptanceTokens', () => {
  it('resolves with the acceptance terms mapped from fetchAcceptanceTokens', async () => {
    const store = makeStore();

    const result = await store.dispatch(checkoutApi.endpoints.getAcceptanceTokens.initiate());

    expect(result.data).toEqual({
      acceptanceToken: 'test-acceptance-token',
      termsUrl: 'https://example.test/terms-and-conditions',
      personalDataAuthToken: 'test-personal-data-token',
      personalDataUrl: 'https://example.test/personal-data-auth',
    });
  });

  it('fails when the gateway responds with a non-2xx status', async () => {
    server.use(http.get('*/merchants/:publicKey', () => HttpResponse.json({}, { status: 500 })));

    const store = makeStore();

    const result = await store.dispatch(checkoutApi.endpoints.getAcceptanceTokens.initiate());

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });
});

describe('upsertCustomer', () => {
  it('unwraps the customer from the data envelope', async () => {
    const store = makeStore();

    const result = await store.dispatch(
      checkoutApi.endpoints.upsertCustomer.initiate({
        documentNumber: customerFixture.documentNumber,
        fullName: customerFixture.fullName,
        email: customerFixture.email,
        phone: customerFixture.phone,
      }),
    );

    expect(result.data).toEqual(customerFixture);
  });
});

describe('createTransaction', () => {
  it('sends the Idempotency-Key header and unwraps the transaction', async () => {
    let receivedHeader: string | null = null;

    server.use(
      http.post('*/api/v1/transactions', ({ request }) => {
        receivedHeader = request.headers.get(IDEMPOTENCY_KEY_HEADER);

        return HttpResponse.json(
          { data: { id: transactionProgressingId, status: 'PENDING' } },
          { status: 201 },
        );
      }),
    );

    const store = makeStore();

    const result = await store.dispatch(
      checkoutApi.endpoints.createTransaction.initiate({
        idempotencyKey: 'a-idempotency-key',
        body: createTransactionRequestBody,
      }),
    );

    expect(receivedHeader).toBe('a-idempotency-key');
    expect(result.data?.transaction.id).toBe(transactionProgressingId);
  });

  it('reports replayed as false when the response carries no Idempotent-Replayed header', async () => {
    const store = makeStore();

    const result = await store.dispatch(
      checkoutApi.endpoints.createTransaction.initiate({
        idempotencyKey: 'a-idempotency-key',
        body: createTransactionRequestBody,
      }),
    );

    expect(result.data?.replayed).toBe(false);
  });

  it('reports replayed as true when the response carries Idempotent-Replayed: true', async () => {
    server.use(
      http.post('*/api/v1/transactions', () =>
        HttpResponse.json(
          { data: { id: transactionProgressingId, status: 'PENDING' } },
          { status: 201, headers: { [IDEMPOTENT_REPLAYED_HEADER]: 'true' } },
        ),
      ),
    );

    const store = makeStore();

    const result = await store.dispatch(
      checkoutApi.endpoints.createTransaction.initiate({
        idempotencyKey: 'a-idempotency-key',
        body: createTransactionRequestBody,
      }),
    );

    expect(result.data?.replayed).toBe(true);
  });
});
