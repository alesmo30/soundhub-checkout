import type { DeliveryFee, DeliveryFeeContext } from './delivery-fee.strategy';
import { DeliveryFeeResolver } from './delivery-fee.resolver';
import { FreeMetroStrategy } from './free-metro.strategy';
import { MetroFlatStrategy } from './metro-flat.strategy';
import { NationalDistanceStrategy } from './national-distance.strategy';

function buildContext(overrides: Partial<DeliveryFeeContext>): DeliveryFeeContext {
  return {
    subtotalInCents: 19_999_900,
    isMetroArea: false,
    distanceKm: 0,
    ...overrides,
  };
}

// Built in the same order as pricing.module.ts's useFactory provider, so
// "first match wins" is exercised the way production wires it.
function buildResolver(): DeliveryFeeResolver {
  return new DeliveryFeeResolver([
    new FreeMetroStrategy(),
    new MetroFlatStrategy(),
    new NationalDistanceStrategy(),
  ]);
}

describe('DeliveryFeeResolver', () => {
  const resolver = buildResolver();

  it.each<[string, Partial<DeliveryFeeContext>, DeliveryFee]>([
    [
      'metro area at the free-metro threshold resolves FREE_METRO, never reaching METRO_FLAT even though it also supports the context',
      { isMetroArea: true, subtotalInCents: 20_000_000 },
      { feeInCents: 0, rule: 'FREE_METRO' },
    ],
    [
      'metro area below the free-metro threshold resolves METRO_FLAT',
      { isMetroArea: true, subtotalInCents: 19_999_900 },
      { feeInCents: 2_000_000, rule: 'METRO_FLAT' },
    ],
    [
      'non-metro area at or above the free-metro threshold still resolves NATIONAL_DISTANCE',
      { isMetroArea: false, subtotalInCents: 20_000_000, distanceKm: 100 },
      { feeInCents: 2_300_000, rule: 'NATIONAL_DISTANCE' }, // 2_000_000 + 6_000 × (100 − 50) = 2_300_000, already a multiple of 50_000
    ],
  ])('%s', (_description, overrides, expected) => {
    expect(resolver.resolve(buildContext(overrides))).toEqual(expected);
  });
});
