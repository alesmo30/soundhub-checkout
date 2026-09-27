import { ErrorCode } from '@checkout/shared/enums';
import type { QuoteQuery } from '@checkout/shared/contracts';

import type {
  Department,
  Municipality,
  MunicipalityRepository,
  Warehouse,
  WarehouseRepository,
} from '../../../locations';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Product } from '../../../catalog';
import type { ProductPage, ProductRepository } from '../../../catalog';
import { DeliveryFeeResolver } from '../../domain/delivery-fee/delivery-fee.resolver';
import { FreeMetroStrategy } from '../../domain/delivery-fee/free-metro.strategy';
import { MetroFlatStrategy } from '../../domain/delivery-fee/metro-flat.strategy';
import { NationalDistanceStrategy } from '../../domain/delivery-fee/national-distance.strategy';
import { GetQuoteUseCase } from './get-quote.use-case';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
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
    ...overrides,
  };
}

function buildMetroMunicipality(overrides: Partial<Municipality> = {}): Municipality {
  return {
    code: '11001',
    name: 'Bogotá D.C.',
    departmentCode: '11',
    departmentName: 'Bogotá D.C.',
    latitude: 4.6097,
    longitude: -74.0817,
    isMetroArea: true,
    ...overrides,
  };
}

function buildNationalMunicipality(overrides: Partial<Municipality> = {}): Municipality {
  return {
    code: '05001',
    name: 'Medellín',
    departmentCode: '05',
    departmentName: 'Antioquia',
    latitude: 6.2442,
    longitude: -75.5812,
    isMetroArea: false,
    ...overrides,
  };
}

function buildWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bodega Bogotá',
    municipalityCode: '11001',
    address: 'Cra 7 # 10-20',
    latitude: 4.6097,
    longitude: -74.0817,
    ...overrides,
  };
}

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

// Same construction as pricing.module.ts's DELIVERY_FEE_RESOLVER factory.
// The strategies are pure (no I/O), so the real resolver is used instead of
// a fake — it is what the 6 delivery-fee-driven cases below actually exercise.
function buildResolver(): DeliveryFeeResolver {
  return new DeliveryFeeResolver([
    new FreeMetroStrategy(),
    new MetroFlatStrategy(),
    new NationalDistanceStrategy(),
  ]);
}

function buildUseCase(params: {
  products?: Product[];
  municipalities?: Municipality[];
  warehouses?: Warehouse[];
}): GetQuoteUseCase {
  return new GetQuoteUseCase({
    productRepository: new FakeProductRepository(params.products ?? [buildProduct()]),
    municipalityRepository: new FakeMunicipalityRepository(
      params.municipalities ?? [buildMetroMunicipality()],
    ),
    warehouseRepository: new FakeWarehouseRepository(params.warehouses ?? [buildWarehouse()]),
    deliveryFeeResolver: buildResolver(),
  });
}

describe('GetQuoteUseCase', () => {
  it('quotes 2 units to a metro municipality with FREE_METRO delivery', async () => {
    const product = buildProduct();
    const municipality = buildMetroMunicipality();
    const warehouse = buildWarehouse();
    const useCase = buildUseCase({
      products: [product],
      municipalities: [municipality],
      warehouses: [warehouse],
    });
    const query: QuoteQuery = {
      productId: product.id,
      quantity: 2,
      municipalityCode: municipality.code,
    };

    const result = await useCase.execute(query);
    const quote = result._unsafeUnwrap();

    expect(quote.product).toEqual({
      id: product.id,
      name: product.name,
      unitPriceInCents: 189_990_000,
    });
    expect(quote.quantity).toBe(2);
    expect(quote.subtotalInCents).toBe(379_980_000);
    expect(quote.vatIncludedInCents).toBe(60_669_100);
    expect(quote.baseFeeInCents).toBe(12_066_000);
    expect(quote.delivery.feeInCents).toBe(0);
    expect(quote.delivery.rule).toBe('FREE_METRO');
    expect(quote.delivery.warehouse).toEqual({ id: warehouse.id, name: warehouse.name });
    expect(quote.totalInCents).toBe(392_046_000);
    expect(quote.currency).toBe('COP');
  });

  it('quotes NATIONAL_DISTANCE for a non-metro municipality with the nearest warehouse', async () => {
    const product = buildProduct();
    const municipality = buildNationalMunicipality();
    const warehouse = buildWarehouse();
    const useCase = buildUseCase({
      products: [product],
      municipalities: [municipality],
      warehouses: [warehouse],
    });
    const query: QuoteQuery = {
      productId: product.id,
      quantity: 1,
      municipalityCode: municipality.code,
    };

    const result = await useCase.execute(query);
    const quote = result._unsafeUnwrap();

    expect(quote.delivery.rule).toBe('NATIONAL_DISTANCE');
    expect(Number.isInteger(quote.delivery.distanceKm)).toBe(true);
    expect(quote.delivery.distanceKm).toBeGreaterThan(0);
    expect(quote.delivery.warehouse).toEqual({ id: warehouse.id, name: warehouse.name });
  });

  it('returns 422 PRODUCT_NOT_FOUND for an unknown product', async () => {
    const municipality = buildMetroMunicipality();
    const useCase = buildUseCase({ products: [], municipalities: [municipality] });

    const result = await useCase.execute({
      productId: '99999999-9999-4999-8999-999999999999',
      quantity: 1,
      municipalityCode: municipality.code,
    });
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
    expect(error.kind).toBe('UNPROCESSABLE');
  });

  it('returns 422 MUNICIPALITY_NOT_FOUND for an unknown municipality', async () => {
    const product = buildProduct();
    const useCase = buildUseCase({ products: [product], municipalities: [] });

    const result = await useCase.execute({
      productId: product.id,
      quantity: 1,
      municipalityCode: '99999',
    });
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.MUNICIPALITY_NOT_FOUND);
    expect(error.kind).toBe('UNPROCESSABLE');
  });

  it('returns 409 OUT_OF_STOCK when quantity exceeds stockAvailable', async () => {
    const product = buildProduct({ stockAvailable: 3 });
    const municipality = buildMetroMunicipality();
    const useCase = buildUseCase({ products: [product], municipalities: [municipality] });

    const result = await useCase.execute({
      productId: product.id,
      quantity: product.stockAvailable + 1,
      municipalityCode: municipality.code,
    });
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.OUT_OF_STOCK);
    expect(error.kind).toBe('CONFLICT');
    expect(error.detail).toContain('Only 3 units available');
  });

  it('accepts a quantity equal to stockAvailable', async () => {
    const product = buildProduct({ stockAvailable: 3 });
    const municipality = buildMetroMunicipality();
    const useCase = buildUseCase({ products: [product], municipalities: [municipality] });

    const result = await useCase.execute({
      productId: product.id,
      quantity: product.stockAvailable,
      municipalityCode: municipality.code,
    });

    expect(result.isOk()).toBe(true);
  });

  it('decides PRODUCT_NOT_FOUND before OUT_OF_STOCK when both apply', async () => {
    const municipality = buildMetroMunicipality();
    const useCase = buildUseCase({ products: [], municipalities: [municipality] });

    const result = await useCase.execute({
      productId: '99999999-9999-4999-8999-999999999999',
      quantity: 999,
      municipalityCode: municipality.code,
    });
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
  });

  it('rejects when there is no active warehouse', async () => {
    const product = buildProduct();
    const municipality = buildMetroMunicipality();
    const useCase = buildUseCase({
      products: [product],
      municipalities: [municipality],
      warehouses: [],
    });

    await expect(
      useCase.execute({
        productId: product.id,
        quantity: 1,
        municipalityCode: municipality.code,
      }),
    ).rejects.toThrow('No active warehouse');
  });
});
