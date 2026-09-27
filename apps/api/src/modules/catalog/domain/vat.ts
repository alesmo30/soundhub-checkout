import type { Cents } from '@checkout/shared/contracts';

import { VAT_RATE_PERCENT } from './catalog.constants';

const PERCENT_SCALE = 100;

/**
 * The price is VAT-included; this extracts the VAT portion, rounded to the
 * whole peso. Integer multiplication before division keeps the result exact
 * for every safe-integer price — a `1.19` float would not reproduce the
 * contract's worked example (`379_980_000 → 60_669_100`).
 */
export function vatIncludedInCents(priceInCents: Cents): Cents {
  return (
    Math.round((priceInCents * VAT_RATE_PERCENT) / ((PERCENT_SCALE + VAT_RATE_PERCENT) * PERCENT_SCALE)) *
    PERCENT_SCALE
  );
}
