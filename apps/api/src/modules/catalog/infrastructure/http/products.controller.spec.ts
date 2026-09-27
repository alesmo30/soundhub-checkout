import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CURRENCY } from '@checkout/shared/constants';
import type {
  Paginated,
  ProblemDetails,
  ProductDetail,
  ProductSummary,
} from '@checkout/shared/contracts';
import { okAsync } from 'neverthrow';
import request from 'supertest';

import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import type { ResultAsync } from '../../../../shared/domain/result';
import type {
  ProductPage,
  ProductRepository,
} from '../../application/ports/product.repository.port';
import { PRODUCT_REPOSITORY } from '../../application/ports/product.repository.port';
import { GetProductDetailUseCase } from '../../application/use-cases/get-product-detail.use-case';
import { ListProductsUseCase } from '../../application/use-cases/list-products.use-case';
import type { Product } from '../../domain/product';
import { ProductsController } from './products.controller';

const KNOWN_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

function buildProduct(index: number): Product {
  return {
    id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    sku: `SKU-${index}`,
    name: `Product ${index}`,
    brand: 'Brand',
    description: 'A product',
    priceInCents: 189_990_000,
    imageUrl: `/images/products/${index}.webp`,
    stockAvailable: 7,
    stockReserved: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

class FakeProductRepository implements ProductRepository {
  constructor(private readonly products: Product[]) {}

  findPage(page: { page: number; limit: number }): ResultAsync<ProductPage, never> {
    const start = (page.page - 1) * page.limit;
    const items = this.products.slice(start, start + page.limit);

    return okAsync({ items, totalItems: this.products.length });
  }

  findById(id: string): ResultAsync<Product | null, never> {
    return okAsync(this.products.find((product) => product.id === id) ?? null);
  }
}

function asProblem(body: unknown): ProblemDetails {
  return body as ProblemDetails;
}

function asProductPage(body: unknown): Paginated<ProductSummary> {
  return body as Paginated<ProductSummary>;
}

function asProductDetailBody(body: unknown): { data: ProductDetail } {
  return body as { data: ProductDetail };
}

describe('ProductsController', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const products = Array.from({ length: 15 }, (_, index) => buildProduct(index));
    products.push({ ...buildProduct(999), id: KNOWN_PRODUCT_ID });

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        ListProductsUseCase,
        GetProductDetailUseCase,
        { provide: PRODUCT_REPOSITORY, useValue: new FakeProductRepository(products) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /products', () => {
    it('returns the { data, meta } envelope with the default page and limit', async () => {
      const response = await request(server).get('/api/v1/products');
      const page = asProductPage(response.body);

      expect(response.status).toBe(200);
      expect(page.data).toHaveLength(10);
      expect(page.meta).toEqual({ page: 1, limit: 10, totalItems: 16, totalPages: 2 });
      expect(page.data[0]).toEqual(
        expect.objectContaining({ currency: CURRENCY, stockAvailable: 7 }),
      );
    });

    it('sets the products Cache-Control header on 200', async () => {
      const response = await request(server).get('/api/v1/products');

      expect(response.headers['cache-control']).toBe('public, max-age=10');
    });

    it('returns 400 with errors[] for page=0', async () => {
      const response = await request(server).get('/api/v1/products?page=0');
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.code).toBe('VALIDATION_ERROR');
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'page' })]),
      );
    });

    it('returns 400 with errors[] for limit=51', async () => {
      const response = await request(server).get('/api/v1/products?limit=51');
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'limit' })]),
      );
    });

    it('returns 400 with errors[] for limit=abc', async () => {
      const response = await request(server).get('/api/v1/products?limit=abc');
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'limit' })]),
      );
    });

    it('does not set the Cache-Control header on a 400', async () => {
      const response = await request(server).get('/api/v1/products?page=0');

      expect(response.headers['cache-control']).toBeUndefined();
    });
  });

  describe('GET /products/:id', () => {
    it('returns the product detail with vatIncludedInCents and maxPurchaseQuantity', async () => {
      const response = await request(server).get(`/api/v1/products/${KNOWN_PRODUCT_ID}`);
      const body = asProductDetailBody(response.body);

      expect(response.status).toBe(200);
      expect(body.data).toEqual(
        expect.objectContaining({
          id: KNOWN_PRODUCT_ID,
          vatIncludedInCents: 30_334_500,
          maxPurchaseQuantity: 7,
        }),
      );
    });

    it('sets the products Cache-Control header on 200', async () => {
      const response = await request(server).get(`/api/v1/products/${KNOWN_PRODUCT_ID}`);

      expect(response.headers['cache-control']).toBe('public, max-age=10');
    });

    it('returns 400 with errors[] for a non-uuid id', async () => {
      const response = await request(server).get('/api/v1/products/abc');
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.code).toBe('VALIDATION_ERROR');
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'id' })]),
      );
    });

    it('does not set the Cache-Control header on a 400', async () => {
      const response = await request(server).get('/api/v1/products/abc');

      expect(response.headers['cache-control']).toBeUndefined();
    });

    it('returns 404 PRODUCT_NOT_FOUND for a well-formed but unknown id', async () => {
      const response = await request(server).get(`/api/v1/products/${UNKNOWN_PRODUCT_ID}`);
      const problem = asProblem(response.body);

      expect(response.status).toBe(404);
      expect(problem.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('does not set the Cache-Control header on a 404', async () => {
      const response = await request(server).get(`/api/v1/products/${UNKNOWN_PRODUCT_ID}`);

      expect(response.headers['cache-control']).toBeUndefined();
    });
  });
});
