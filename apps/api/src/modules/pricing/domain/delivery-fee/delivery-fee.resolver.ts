import type { DeliveryFee, DeliveryFeeContext, DeliveryFeeStrategy } from './delivery-fee.strategy';

export class DeliveryFeeResolver {
  constructor(private readonly strategies: readonly DeliveryFeeStrategy[]) {}

  resolve(ctx: DeliveryFeeContext): DeliveryFee {
    const strategy = this.strategies.find((candidate) => candidate.supports(ctx));

    if (!strategy) {
      // Unreachable in practice: NationalDistanceStrategy.supports always
      // returns true, so any ordered array that includes it always matches.
      throw new Error('No delivery fee strategy matched the context');
    }

    return strategy.quote(ctx);
  }
}
