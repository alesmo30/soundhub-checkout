import type { Cents } from '@checkout/shared/contracts';

import {
  BASE_FEE_FIXED_IN_CENTS,
  BASE_FEE_RATE_BASIS_POINTS,
  BASE_FEE_VAT_PERCENT,
} from './pricing.constants';

const BASIS_POINTS_SCALE = 10_000;
const PERCENT_SCALE = 100;

/**
 * The gateway's commission (a percentage plus a fixed amount) plus VAT on
 * that commission, rounded to the whole peso. Integer multiplication before
 * division keeps the result exact — the contract's worked example
 * (`379_980_000 → 12_066_000`) only reproduces this way; rounding to the
 * cent instead gives `12_065_969`, and float rates (`0.0265`, `1.19`) drift
 * for large subtotals.
 */
export function baseFeeInCents(subtotalInCents: Cents): Cents {
  const feeBeforeVatScaled =
    subtotalInCents * BASE_FEE_RATE_BASIS_POINTS + BASE_FEE_FIXED_IN_CENTS * BASIS_POINTS_SCALE;
  const feeWithVatScaled = feeBeforeVatScaled * (PERCENT_SCALE + BASE_FEE_VAT_PERCENT);

  return (
    Math.round(feeWithVatScaled / (BASIS_POINTS_SCALE * PERCENT_SCALE * PERCENT_SCALE)) *
    PERCENT_SCALE
  );
}
