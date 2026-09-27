import { METRO_FLAT_FEE_IN_CENTS } from '../pricing.constants';
import type { DeliveryFeeContext } from './delivery-fee.strategy';
import { MetroFlatStrategy } from './metro-flat.strategy';

function buildContext(overrides: Partial<DeliveryFeeContext>): DeliveryFeeContext {
  return {
    subtotalInCents: 19_999_900,
    isMetroArea: true,
    distanceKm: 0,
    ...overrides,
  };
}

describe('MetroFlatStrategy', () => {
  const strategy = new MetroFlatStrategy();

  it.each<[string, Partial<DeliveryFeeContext>, boolean]>([
    [
      'metro area, subtotal below the free-metro threshold',
      { isMetroArea: true, subtotalInCents: 19_999_900 },
      true,
    ],
    [
      'metro area, subtotal at the free-metro threshold',
      { isMetroArea: true, subtotalInCents: 20_000_000 },
      true,
    ],
    ['non-metro area', { isMetroArea: false }, false],
  ])('supports: %s -> %s', (_description, overrides, expected) => {
    expect(strategy.supports(buildContext(overrides))).toBe(expected);
  });

  it('quotes the flat metro fee under the METRO_FLAT rule', () => {
    expect(strategy.quote()).toEqual({ feeInCents: METRO_FLAT_FEE_IN_CENTS, rule: 'METRO_FLAT' });
  });
});
