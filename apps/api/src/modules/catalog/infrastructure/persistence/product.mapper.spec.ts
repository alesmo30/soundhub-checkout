import { toProduct } from './product.mapper';
import type { ProductOrmEntity } from './product.orm-entity';

function buildEntity(overrides: Partial<ProductOrmEntity> = {}): ProductOrmEntity {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    sku: 'HP-SNY-WH1000XM5',
    name: 'Sony WH-1000XM5',
    brand: 'Sony',
    description: 'Noise cancelling headphones',
    priceCents: 189_990_000,
    imageUrl: '/images/products/hp-sny-wh1000xm5-640.webp',
    stockAvailable: 7,
    stockReserved: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('toProduct', () => {
  it('maps every ORM column to its domain field, renaming priceCents to priceInCents', () => {
    const entity = buildEntity();

    expect(toProduct(entity)).toEqual({
      id: entity.id,
      sku: entity.sku,
      name: entity.name,
      brand: entity.brand,
      description: entity.description,
      priceInCents: entity.priceCents,
      imageUrl: entity.imageUrl,
      stockAvailable: entity.stockAvailable,
      stockReserved: entity.stockReserved,
      createdAt: entity.createdAt,
    });
  });

  it('does not leak ORM-only columns such as updatedAt or deletedAt', () => {
    const entity = buildEntity();

    expect(toProduct(entity)).not.toHaveProperty('updatedAt');
    expect(toProduct(entity)).not.toHaveProperty('deletedAt');
  });
});
