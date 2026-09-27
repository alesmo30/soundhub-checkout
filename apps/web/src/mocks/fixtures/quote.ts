import type { Quote } from '@checkout/shared/contracts';
import { CURRENCY } from '@checkout/shared/constants';
import { FeeRule } from '@checkout/shared/enums';

import { products } from './products';

const wh1000xm5 = products.find((product) => product.sku === 'HP-SNY-WH1000XM5');

if (!wh1000xm5) {
  throw new Error('Fixture inconsistency: HP-SNY-WH1000XM5 not found in products fixture');
}

export const quoteFixture: Quote = {
  product: {
    id: wh1000xm5.id,
    name: wh1000xm5.name,
    unitPriceInCents: wh1000xm5.priceInCents,
  },
  quantity: 2,
  subtotalInCents: 379_980_000,
  vatIncludedInCents: 60_669_100,
  baseFeeInCents: 12_066_000,
  delivery: {
    feeInCents: 0,
    rule: FeeRule.FREE_METRO,
    distanceKm: 4,
    warehouse: { id: '22222222-2222-4222-8222-222222222201', name: 'Medellín DC' },
  },
  totalInCents: 392_046_000,
  currency: CURRENCY,
};
