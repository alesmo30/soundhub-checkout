import { CURRENCY } from '@checkout/shared/constants';

import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { ProductPage, ProductRepository } from '../ports/product.repository.port';
import type { Product } from '../../domain/product';
import { ListProductsUseCase } from './list-products.use-case';

function buildProduct(index: number): Product {
  const id = `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;

  return {
    id,
    sku: `SKU-${index}`,
    name: `Product ${index}`,
    brand: 'Brand',
    description: 'A product',
    priceInCents: 100_000,
    imageUrl: `/images/products/${index}.webp`,
    stockAvailable: 10,
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

describe('ListProductsUseCase', () => {
  it('maps items and reports meta for the first page of a 15-product catalog', async () => {
    const products = Array.from({ length: 15 }, (_, index) => buildProduct(index));
    const useCase = new ListProductsUseCase(new FakeProductRepository(products));

    const result = await useCase.execute({ page: 1, limit: 10 });
    const page = result._unsafeUnwrap();

    expect(page.data).toHaveLength(10);
    expect(page.data[0]).toEqual({
      id: products[0]?.id,
      sku: products[0]?.sku,
      name: products[0]?.name,
      brand: products[0]?.brand,
      priceInCents: products[0]?.priceInCents,
      currency: CURRENCY,
      imageUrl: products[0]?.imageUrl,
      stockAvailable: products[0]?.stockAvailable,
    });
    expect(page.meta).toEqual({ page: 1, limit: 10, totalItems: 15, totalPages: 2 });
  });

  it('reports the remaining items and correct meta for a middle/last page', async () => {
    const products = Array.from({ length: 15 }, (_, index) => buildProduct(index));
    const useCase = new ListProductsUseCase(new FakeProductRepository(products));

    const result = await useCase.execute({ page: 2, limit: 10 });
    const page = result._unsafeUnwrap();

    expect(page.data).toHaveLength(5);
    expect(page.meta).toEqual({ page: 2, limit: 10, totalItems: 15, totalPages: 2 });
  });

  it('returns an empty page with the real totalItems/totalPages past the end', async () => {
    const products = Array.from({ length: 15 }, (_, index) => buildProduct(index));
    const useCase = new ListProductsUseCase(new FakeProductRepository(products));

    const result = await useCase.execute({ page: 3, limit: 10 });
    const page = result._unsafeUnwrap();

    expect(page.data).toEqual([]);
    expect(page.meta).toEqual({ page: 3, limit: 10, totalItems: 15, totalPages: 2 });
  });

  it('reports totalPages 0 for an empty catalog', async () => {
    const useCase = new ListProductsUseCase(new FakeProductRepository([]));

    const result = await useCase.execute({ page: 1, limit: 10 });
    const page = result._unsafeUnwrap();

    expect(page.data).toEqual([]);
    expect(page.meta).toEqual({ page: 1, limit: 10, totalItems: 0, totalPages: 0 });
  });
});
