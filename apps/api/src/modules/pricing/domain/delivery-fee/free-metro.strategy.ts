import { FREE_METRO_MIN_SUBTOTAL_IN_CENTS } from '../pricing.constants';
import type { DeliveryFee, DeliveryFeeContext, DeliveryFeeStrategy } from './delivery-fee.strategy';

export class FreeMetroStrategy implements DeliveryFeeStrategy {
  supports(ctx: DeliveryFeeContext): boolean {
    return ctx.isMetroArea && ctx.subtotalInCents >= FREE_METRO_MIN_SUBTOTAL_IN_CENTS;
  }

  quote(): DeliveryFee {
    return { feeInCents: 0, rule: 'FREE_METRO' };
  }
}
