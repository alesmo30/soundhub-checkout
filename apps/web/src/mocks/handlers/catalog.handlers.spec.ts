import type {
  ApiResponse,
  Paginated,
  ProblemDetails,
  ProductDetail,
  ProductSummary,
} from '@checkout/shared/contracts';

import { env } from '@/config/env';

import { products } from '../fixtures/products';

describe('catalog handlers', () => {
  it('paginates GET /products by page and limit', async () => {
    const response = await fetch(`${env.apiBaseUrl}/products?page=2&limit=10`);
    const body = (await response.json()) as Paginated<ProductSummary>;

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ page: 2, limit: 10, totalItems: 12, totalPages: 2 });
  });

  it('defaults to page 1 and limit 10', async () => {
    const response = await fetch(`${env.apiBaseUrl}/products`);
    const body = (await response.json()) as Paginated<ProductSummary>;

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(10);
    expect(body.meta.page).toBe(1);
  });

  it('returns the full detail for a known product id', async () => {
    const target = products[0]!;

    const response = await fetch(`${env.apiBaseUrl}/products/${target.id}`);
    const body = (await response.json()) as ApiResponse<ProductDetail>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(target);
  });

  it('returns 404 PRODUCT_NOT_FOUND for an unknown product id', async () => {
    const response = await fetch(`${env.apiBaseUrl}/products/does-not-exist`);
    const body = (await response.json()) as ProblemDetails;

    expect(response.status).toBe(404);
    expect(body.code).toBe('PRODUCT_NOT_FOUND');
  });
});
