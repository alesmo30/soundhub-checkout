import { MAX_QUANTITY } from '@checkout/shared/constants';

import {
  BASE_FEE_FIXED_IN_CENTS,
  BASE_FEE_RATE_BASIS_POINTS,
  BASE_FEE_VAT_PERCENT,
} from './pricing.constants';
import { baseFeeInCents } from './base-fee';

// From apps/api/src/shared/infrastructure/persistence/seeds/data/products.json
const CHEAPEST_SEEDED_PRICE_IN_CENTS = 22_990_000; // HP-JBL-TUNE520BT
const MOST_EXPENSIVE_SEEDED_PRICE_IN_CENTS = 299_990_000; // HP-APL-AIRPODSMAX

describe('baseFeeInCents', () => {
  it('matches the /quotes contract example', () => {
    expect(baseFeeInCents(379_980_000)).toBe(12_066_000);
  });

  it('rounds a fee that lands exactly on .5 pesos up to the next peso', () => {
    // (10_000_000 × 265 + 700_000_000) × 119 / 100_000_000 = 3986.5 exactly,
    // exercising Math.round's half-up rule.
    expect(baseFeeInCents(10_000_000)).toBe(398_700);
  });

  it('computes the fee for the smallest subtotal (one unit of the cheapest seeded product)', () => {
    expect(baseFeeInCents(CHEAPEST_SEEDED_PRICE_IN_CENTS)).toBe(808_300);
  });

  it('stays a safe integer for the worst realistic subtotal (MAX_QUANTITY of the priciest seeded product)', () => {
    const worstCaseSubtotalInCents = MAX_QUANTITY * MOST_EXPENSIVE_SEEDED_PRICE_IN_CENTS;

    // Mirrors the pre-rounding intermediate product from base-fee.ts: the spec
    // flags this as the step that could exceed Number.MAX_SAFE_INTEGER for a
    // subtotal far above what MAX_QUANTITY × the priciest seeded product can
    // ever produce.
    const worstCaseIntermediateProduct =
      (worstCaseSubtotalInCents * BASE_FEE_RATE_BASIS_POINTS + BASE_FEE_FIXED_IN_CENTS * 10_000) *
      (100 + BASE_FEE_VAT_PERCENT);

    expect(Number.isSafeInteger(worstCaseIntermediateProduct)).toBe(true);
    expect(Number.isSafeInteger(baseFeeInCents(worstCaseSubtotalInCents))).toBe(true);
    expect(baseFeeInCents(worstCaseSubtotalInCents)).toBe(94_685_100);
  });
});
