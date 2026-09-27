import { HttpResponse, http } from 'msw';

import { makeStore } from '@/app/store';
import { departments, municipalitiesByDepartment } from '@/mocks/fixtures/locations';
import { quoteFixture } from '@/mocks/fixtures/quote';
import { server } from '@/mocks/server';

import { checkoutApi } from './checkout.api';

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
