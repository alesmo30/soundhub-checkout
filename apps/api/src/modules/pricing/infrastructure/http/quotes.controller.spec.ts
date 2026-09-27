import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ProblemDetails, Quote } from '@checkout/shared/contracts';
import request from 'supertest';

import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Product, ProductRepository, ProductPage } from '../../../catalog';
import type {
  Department,
  Municipality,
  MunicipalityRepository,
  Warehouse,
  WarehouseRepository,
} from '../../../locations';
import { GetQuoteUseCase } from '../../application/use-cases/get-quote.use-case';
import { GET_QUOTE_DEPENDENCIES } from '../../application/ports/get-quote.dependencies';
import { DeliveryFeeResolver } from '../../domain/delivery-fee/delivery-fee.resolver';
import { FreeMetroStrategy } from '../../domain/delivery-fee/free-metro.strategy';
import { MetroFlatStrategy } from '../../domain/delivery-fee/metro-flat.strategy';
import { NationalDistanceStrategy } from '../../domain/delivery-fee/national-distance.strategy';
import { QuotesController } from './quotes.controller';

const PRODUCT = {
  id: '11111111-1111-4111-8111-111111111111',
  sku: 'HP-SNY-WH1000XM5',
  name: 'Sony WH-1000XM5',
  brand: 'Sony',
  description: 'Noise-cancelling headphones',
  priceInCents: 189_990_000,
  imageUrl: '/images/products/sony-wh1000xm5.webp',
  stockAvailable: 10,
  stockReserved: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
} satisfies Product;

const METRO_MUNICIPALITY = {
  code: '11001',
  name: 'Bogotá D.C.',
  departmentCode: '11',
  departmentName: 'Bogotá D.C.',
  latitude: 4.6097,
  longitude: -74.0817,
  isMetroArea: true,
} satisfies Municipality;

const WAREHOUSE = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Bodega Bogotá',
  municipalityCode: '11001',
  address: 'Cra 7 # 10-20',
  latitude: 4.6097,
  longitude: -74.0817,
} satisfies Warehouse;

class FakeProductRepository implements ProductRepository {
  constructor(private readonly products: Product[]) {}

  findPage(): ResultAsync<ProductPage, never> {
    return okAsync({ items: this.products, totalItems: this.products.length });
  }

  findById(id: string): ResultAsync<Product | null, never> {
    return okAsync(this.products.find((product) => product.id === id) ?? null);
  }
}

class FakeMunicipalityRepository implements MunicipalityRepository {
  constructor(private readonly municipalities: Municipality[]) {}

  listDepartments(): ResultAsync<Department[], never> {
    return okAsync([]);
  }

  listByDepartment(): ResultAsync<Municipality[], never> {
    return okAsync(this.municipalities);
  }

  findByCode(code: string): ResultAsync<Municipality | null, never> {
    return okAsync(this.municipalities.find((municipality) => municipality.code === code) ?? null);
  }
}

class FakeWarehouseRepository implements WarehouseRepository {
  constructor(private readonly warehouses: Warehouse[]) {}

  listActive(): ResultAsync<Warehouse[], never> {
    return okAsync(this.warehouses);
  }

  findById(id: string): ResultAsync<Warehouse | null, never> {
    return okAsync(this.warehouses.find((warehouse) => warehouse.id === id) ?? null);
  }
}

function buildResolver(): DeliveryFeeResolver {
  return new DeliveryFeeResolver([
    new FreeMetroStrategy(),
    new MetroFlatStrategy(),
    new NationalDistanceStrategy(),
  ]);
}

function buildTestingModuleDependencies(params: {
  products?: Product[];
  municipalities?: Municipality[];
  warehouses?: Warehouse[];
}) {
  return {
    productRepository: new FakeProductRepository(params.products ?? [PRODUCT]),
    municipalityRepository: new FakeMunicipalityRepository(
      params.municipalities ?? [METRO_MUNICIPALITY],
    ),
    warehouseRepository: new FakeWarehouseRepository(params.warehouses ?? [WAREHOUSE]),
    deliveryFeeResolver: buildResolver(),
  };
}

async function buildApp(params: {
  products?: Product[];
  municipalities?: Municipality[];
  warehouses?: Warehouse[];
}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [QuotesController],
    providers: [
      GetQuoteUseCase,
      { provide: GET_QUOTE_DEPENDENCIES, useValue: buildTestingModuleDependencies(params) },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

function asProblem(body: unknown): ProblemDetails {
  return body as ProblemDetails;
}

function asQuoteBody(body: unknown): { data: Quote } {
  return body as { data: Quote };
}

const VALID_QUERY =
  `productId=${PRODUCT.id}&quantity=2&municipalityCode=${METRO_MUNICIPALITY.code}` as const;

describe('QuotesController', () => {
  describe('GET /quotes', () => {
    let app: INestApplication;
    let server: Server;

    beforeAll(async () => {
      app = await buildApp({});
      server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns the { data: Quote } envelope', async () => {
      const response = await request(server).get(`/api/v1/quotes?${VALID_QUERY}`);
      const body = asQuoteBody(response.body);

      expect(response.status).toBe(200);
      expect(body.data.totalInCents).toBe(392_046_000);
      expect(body.data.baseFeeInCents).toBe(12_066_000);
      expect(body.data.delivery.rule).toBe('FREE_METRO');
    });

    it('sets Cache-Control: no-store on the 200', async () => {
      const response = await request(server).get(`/api/v1/quotes?${VALID_QUERY}`);

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('returns 400 with errors[] for a non-uuid productId', async () => {
      const response = await request(server).get(
        `/api/v1/quotes?productId=abc&quantity=2&municipalityCode=${METRO_MUNICIPALITY.code}`,
      );
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.code).toBe('VALIDATION_ERROR');
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'productId' })]),
      );
    });

    it('returns 400 with errors[] for quantity=0', async () => {
      const response = await request(server).get(
        `/api/v1/quotes?productId=${PRODUCT.id}&quantity=0&municipalityCode=${METRO_MUNICIPALITY.code}`,
      );
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'quantity' })]),
      );
    });

    it('returns 400 with errors[] for quantity=11', async () => {
      const response = await request(server).get(
        `/api/v1/quotes?productId=${PRODUCT.id}&quantity=11&municipalityCode=${METRO_MUNICIPALITY.code}`,
      );
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'quantity' })]),
      );
    });

    it('returns 400 with errors[] for quantity=abc', async () => {
      const response = await request(server).get(
        `/api/v1/quotes?productId=${PRODUCT.id}&quantity=abc&municipalityCode=${METRO_MUNICIPALITY.code}`,
      );
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'quantity' })]),
      );
    });

    it('returns 400 with errors[] for municipalityCode=0500', async () => {
      const response = await request(server).get(
        `/api/v1/quotes?productId=${PRODUCT.id}&quantity=2&municipalityCode=0500`,
      );
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'municipalityCode' })]),
      );
    });

    it('returns 400 for an unknown query parameter', async () => {
      const response = await request(server).get(`/api/v1/quotes?${VALID_QUERY}&extra=1`);
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /quotes — domain errors as Problem Details', () => {
    it('returns 422 PRODUCT_NOT_FOUND for an unknown product', async () => {
      const app = await buildApp({ products: [] });
      const server = app.getHttpServer() as Server;

      const response = await request(server).get(`/api/v1/quotes?${VALID_QUERY}`);
      const problem = asProblem(response.body);

      expect(response.status).toBe(422);
      expect(problem.type).toBeDefined();
      expect(problem.title).toBeDefined();
      expect(problem.code).toBe('PRODUCT_NOT_FOUND');

      await app.close();
    });

    it('returns 409 OUT_OF_STOCK when quantity exceeds stockAvailable', async () => {
      const product = { ...PRODUCT, stockAvailable: 1 };
      const app = await buildApp({ products: [product] });
      const server = app.getHttpServer() as Server;

      const response = await request(server).get(
        `/api/v1/quotes?productId=${product.id}&quantity=2&municipalityCode=${METRO_MUNICIPALITY.code}`,
      );
      const problem = asProblem(response.body);

      expect(response.status).toBe(409);
      expect(problem.type).toBeDefined();
      expect(problem.title).toBeDefined();
      expect(problem.code).toBe('OUT_OF_STOCK');

      await app.close();
    });
  });
});
