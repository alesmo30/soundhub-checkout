import { products } from './products';

describe('products fixture', () => {
  it('has exactly 12 products', () => {
    expect(products).toHaveLength(12);
  });

  it('follows the HP-<BRAND>-<MODEL> sku pattern', () => {
    for (const product of products) {
      expect(product.sku).toMatch(/^HP-[A-Z0-9]+-[A-Z0-9]+$/);
    }
  });

  it('prices are always a multiple of 100 cents', () => {
    for (const product of products) {
      expect(product.priceInCents % 100).toBe(0);
    }
  });

  it('has exactly one product out of stock', () => {
    expect(products.filter((product) => product.stockAvailable === 0)).toHaveLength(1);
  });

  it('points imageUrl at /images/products/<sku>-640.webp', () => {
    for (const product of products) {
      expect(product.imageUrl).toBe(`/images/products/${product.sku.toLowerCase()}-640.webp`);
    }
  });
});
