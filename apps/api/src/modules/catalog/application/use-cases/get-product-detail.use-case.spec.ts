import { ErrorCode } from '@checkout/shared/enums';

import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { ProductPage, ProductRepository } from '../ports/product.repository.port';
import type { Product } from '../../domain/product';
import { GetProductDetailUseCase } from './get-product-detail.use-case';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sku: 'HP-SNY-WH1000XM5',
    name: 'Sony WH-1000XM5',
    brand: 'Sony',
    description: 'Noise-cancelling headphones',
    priceInCents: 189_990_000,
    imageUrl: '/images/products/sony-wh1000xm5.webp',
    stockAvailable: 7,
    stockReserved: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
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

describe('GetProductDetailUseCase', () => {
  it('returns the VAT and maxPurchaseQuantity for a known product', async () => {
    const product = buildProduct();
    const useCase = new GetProductDetailUseCase(new FakeProductRepository([product]));

    const result = await useCase.execute(product.id);
    const detail = result._unsafeUnwrap();

    expect(detail.vatIncludedInCents).toBe(30_334_500);
    expect(detail.maxPurchaseQuantity).toBe(7);
    expect(detail.description).toBe(product.description);
  });

  it('caps maxPurchaseQuantity at MAX_QUANTITY even when stock is higher', async () => {
    const product = buildProduct({ stockAvailable: 25 });
    const useCase = new GetProductDetailUseCase(new FakeProductRepository([product]));

    const result = await useCase.execute(product.id);
    const detail = result._unsafeUnwrap();

    expect(detail.maxPurchaseQuantity).toBe(10);
  });

  it('returns PRODUCT_NOT_FOUND for an unknown id', async () => {
    const useCase = new GetProductDetailUseCase(new FakeProductRepository([]));

    const result = await useCase.execute('22222222-2222-4222-8222-222222222222');
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
    expect(error.kind).toBe('NOT_FOUND');
  });
});
