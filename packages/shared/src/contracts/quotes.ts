import type { Cents, Currency } from './common';
import type { FeeRule } from '../enums';

export interface QuoteQuery {
  productId: string;
  quantity: number;
  municipalityCode: string;
}

export interface Quote {
  product: { id: string; name: string; unitPriceInCents: Cents };
  quantity: number;
  subtotalInCents: Cents;
  vatIncludedInCents: Cents;
  baseFeeInCents: Cents;
  delivery: {
    feeInCents: Cents;
    rule: FeeRule;
    distanceKm: number;
    warehouse: { id: string; name: string };
  };
  totalInCents: Cents;
  currency: Currency;
}
