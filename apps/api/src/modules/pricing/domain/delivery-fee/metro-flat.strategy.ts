import { METRO_FLAT_FEE_IN_CENTS } from '../pricing.constants';
import type { DeliveryFee, DeliveryFeeContext, DeliveryFeeStrategy } from './delivery-fee.strategy';

export class MetroFlatStrategy implements DeliveryFeeStrategy {
  supports(ctx: DeliveryFeeContext): boolean {
    return ctx.isMetroArea;
  }

  quote(): DeliveryFee {
    return { feeInCents: METRO_FLAT_FEE_IN_CENTS, rule: 'METRO_FLAT' };
  }
}
