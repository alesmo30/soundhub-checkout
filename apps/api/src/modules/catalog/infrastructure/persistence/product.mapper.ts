import type { Product } from '../../domain/product';
import type { ProductOrmEntity } from './product.orm-entity';

export function toProduct(entity: ProductOrmEntity): Product {
  return {
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
  };
}
