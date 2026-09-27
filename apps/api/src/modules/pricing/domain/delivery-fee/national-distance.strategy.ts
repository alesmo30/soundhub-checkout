import {
  NATIONAL_BASE_FEE_IN_CENTS,
  NATIONAL_FEE_CAP_IN_CENTS,
  NATIONAL_FEE_PER_KM_IN_CENTS,
  NATIONAL_FREE_KM,
  NATIONAL_ROUNDING_STEP_IN_CENTS,
} from '../pricing.constants';
import type { DeliveryFee, DeliveryFeeContext, DeliveryFeeStrategy } from './delivery-fee.strategy';

// Rounds up to the nearest multiple of `step`, e.g. ceilTo(2_006_000, 50_000) === 2_050_000.
function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export class NationalDistanceStrategy implements DeliveryFeeStrategy {
  supports(): boolean {
    return true;
  }

  quote(ctx: DeliveryFeeContext): DeliveryFee {
    const billableKm = Math.max(0, ctx.distanceKm - NATIONAL_FREE_KM);
    const rawFeeInCents = NATIONAL_BASE_FEE_IN_CENTS + NATIONAL_FEE_PER_KM_IN_CENTS * billableKm;
    const feeInCents = Math.min(
      ceilTo(rawFeeInCents, NATIONAL_ROUNDING_STEP_IN_CENTS),
      NATIONAL_FEE_CAP_IN_CENTS,
    );

    return { feeInCents, rule: 'NATIONAL_DISTANCE' };
  }
}
