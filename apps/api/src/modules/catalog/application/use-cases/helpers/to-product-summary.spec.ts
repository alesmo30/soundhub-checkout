import { CURRENCY } from '@checkout/shared/constants';

import type { Product } from '../../../domain/product';
import { toProductSummary } from './to-product-summary';

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

describe('toProductSummary', () => {
  it('maps the Product domain fields to the ProductSummary contract shape, adding CURRENCY', () => {
    const product = buildProduct();

    const summary = toProductSummary(product);

    expect(summary).toEqual({
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      priceInCents: product.priceInCents,
      currency: CURRENCY,
      imageUrl: product.imageUrl,
      stockAvailable: product.stockAvailable,
    });
  });

  it('never includes description, stockReserved or timestamps', () => {
    const summary = toProductSummary(buildProduct()) as unknown as Record<string, unknown>;

    expect(summary.description).toBeUndefined();
    expect(summary.stockReserved).toBeUndefined();
    expect(summary.createdAt).toBeUndefined();
  });
});
