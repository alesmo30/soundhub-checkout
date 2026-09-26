import type { Cents, Currency } from './common';

export interface ProductListQuery {
  page?: number;
  limit?: number;
}

export interface ProductSummary {
  id: string;
  sku: string;
  name: string;
  brand: string;
  priceInCents: Cents;
  currency: Currency;
  imageUrl: string;
  stockAvailable: number;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  vatIncludedInCents: Cents;
  maxPurchaseQuantity: number;
}
