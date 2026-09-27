import { CURRENCY } from '@checkout/shared/constants';
import type { ProductSummary } from '@checkout/shared/contracts';

import type { Product } from '../../../domain/product';

export function toProductSummary(product: Product): ProductSummary {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    priceInCents: product.priceInCents,
    currency: CURRENCY,
    imageUrl: product.imageUrl,
    stockAvailable: product.stockAvailable,
  };
}
