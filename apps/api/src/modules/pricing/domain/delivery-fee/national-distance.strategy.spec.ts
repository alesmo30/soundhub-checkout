import type { DeliveryFeeContext, DeliveryFeeStrategy } from './delivery-fee.strategy';
import { NationalDistanceStrategy } from './national-distance.strategy';

function buildContext(overrides: Partial<DeliveryFeeContext>): DeliveryFeeContext {
  return {
    subtotalInCents: 19_999_900,
    isMetroArea: false,
    distanceKm: 0,
    ...overrides,
  };
}

describe('NationalDistanceStrategy', () => {
  const strategy: DeliveryFeeStrategy = new NationalDistanceStrategy();

  it.each<[Partial<DeliveryFeeContext>]>([
    [{ isMetroArea: false }],
    [{ isMetroArea: true }],
    [{ isMetroArea: false, subtotalInCents: 20_000_000 }],
  ])('always supports the context (%o)', (overrides) => {
    expect(strategy.supports(buildContext(overrides))).toBe(true);
  });

  it.each<[number, number]>([
    [0, 2_000_000],
    [50, 2_000_000],
    [51, 2_050_000], // 2_000_000 + 6_000 × 1 = 2_006_000, rounded up to 2_050_000
    [400, 4_100_000], // 2_000_000 + 6_000 × 350 = 4_100_000, already a multiple of 50_000
    [716, 6_000_000], // 2_000_000 + 6_000 × 666 = 5_996_000 -> rounded to 6_000_000, at the cap
    [717, 6_000_000], // 2_000_000 + 6_000 × 667 = 6_002_000 -> rounded to 6_050_000, capped to 6_000_000
    [2000, 6_000_000], // far past the cap
  ])('quotes %i km as %i cents under the NATIONAL_DISTANCE rule', (distanceKm, feeInCents) => {
    expect(strategy.quote(buildContext({ distanceKm }))).toEqual({
      feeInCents,
      rule: 'NATIONAL_DISTANCE',
    });
  });

  it('ignores the subtotal, so a non-metro subtotal at or above the free-metro threshold still pays by distance', () => {
    const cheap = strategy.quote(buildContext({ subtotalInCents: 100_000, distanceKm: 100 }));
    const expensive = strategy.quote(
      buildContext({ subtotalInCents: 20_000_000, distanceKm: 100 }),
    );

    expect(cheap).toEqual(expensive);
  });
});
