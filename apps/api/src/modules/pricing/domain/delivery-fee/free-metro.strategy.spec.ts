import { FREE_METRO_MIN_SUBTOTAL_IN_CENTS } from '../pricing.constants';
import type { DeliveryFeeContext } from './delivery-fee.strategy';
import { FreeMetroStrategy } from './free-metro.strategy';

function buildContext(overrides: Partial<DeliveryFeeContext>): DeliveryFeeContext {
  return {
    subtotalInCents: FREE_METRO_MIN_SUBTOTAL_IN_CENTS,
    isMetroArea: true,
    distanceKm: 0,
    ...overrides,
  };
}

describe('FreeMetroStrategy', () => {
  const strategy = new FreeMetroStrategy();

  it.each<[string, Partial<DeliveryFeeContext>, boolean]>([
    [
      'metro area, subtotal just below the threshold',
      { isMetroArea: true, subtotalInCents: 19_999_900 },
      false,
    ],
    [
      'metro area, subtotal at the threshold',
      { isMetroArea: true, subtotalInCents: 20_000_000 },
      true,
    ],
    [
      'non-metro area, subtotal above the threshold',
      { isMetroArea: false, subtotalInCents: 20_000_000 },
      false,
    ],
  ])('supports: %s -> %s', (_description, overrides, expected) => {
    expect(strategy.supports(buildContext(overrides))).toBe(expected);
  });

  it('quotes a zero fee under the FREE_METRO rule', () => {
    expect(strategy.quote()).toEqual({ feeInCents: 0, rule: 'FREE_METRO' });
  });
});
