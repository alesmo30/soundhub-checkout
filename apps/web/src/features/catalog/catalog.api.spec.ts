import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ApiResponse, ProductDetail } from '@checkout/shared/contracts';

import { makeStore } from '@/app/store';
import { products } from '@/mocks/fixtures/products';
import { server } from '@/mocks/server';

import { catalogApi, invalidateProduct } from './catalog.api';

const product = products[0]!;

describe('getProducts', () => {
  it('requests the page with the default page size and keeps data and meta', async () => {
    const store = makeStore();

    const result = await store.dispatch(catalogApi.endpoints.getProducts.initiate({ page: 2 }));

    expect(result.data?.data).toHaveLength(2);
    expect(result.data?.meta).toEqual({ page: 2, limit: 10, totalItems: 12, totalPages: 2 });
  });
});

describe('getProduct', () => {
  it('unwraps the detail from the data envelope', async () => {
    const store = makeStore();

    const result = await store.dispatch(catalogApi.endpoints.getProduct.initiate(product.id));

    expect(result.data).toEqual(product);
  });

  it('exposes a 404 as an error with no data', async () => {
    const store = makeStore();

    const result = await store.dispatch(catalogApi.endpoints.getProduct.initiate('unknown'));

    expect(result.data).toBeUndefined();
    expect(result.error).toMatchObject({ status: 404 });
  });
});

describe('invalidateProduct', () => {
  it('re-fetches a subscribed product and shows the new stock', async () => {
    const stockPerRequest = [7, 6];
    let requests = 0;

    server.use(
      http.get('*/api/v1/products/:id', () => {
        const stockAvailable = stockPerRequest[requests] ?? 0;
        requests += 1;
        const body: ApiResponse<ProductDetail> = { data: { ...product, stockAvailable } };

        return HttpResponse.json(body);
      }),
    );

    const store = makeStore();
    const subscription = store.dispatch(catalogApi.endpoints.getProduct.initiate(product.id));
    await subscription;

    store.dispatch(invalidateProduct(product.id));

    const selectProduct = catalogApi.endpoints.getProduct.select(product.id);
    await waitFor(() => expect(selectProduct(store.getState()).data?.stockAvailable).toBe(6));
    expect(requests).toBe(2);

    subscription.unsubscribe();
  });

  it('re-fetches a subscribed list, even one that failed', async () => {
    let requests = 0;

    server.use(
      http.get('*/api/v1/products', () => {
        requests += 1;

        return HttpResponse.json({}, { status: 500 });
      }),
    );

    const store = makeStore();
    const subscription = store.dispatch(catalogApi.endpoints.getProducts.initiate({ page: 1 }));
    await subscription;

    store.dispatch(invalidateProduct(product.id));

    await waitFor(() => expect(requests).toBe(2));

    subscription.unsubscribe();
  });
});
