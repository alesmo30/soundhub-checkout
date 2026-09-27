import { vatIncludedInCents } from './vat';

describe('vatIncludedInCents', () => {
  it('matches the contract worked example for the headphones price', () => {
    expect(vatIncludedInCents(189_990_000)).toBe(30_334_500);
  });

  it('matches the /quotes contract example', () => {
    expect(vatIncludedInCents(379_980_000)).toBe(60_669_100);
  });

  it('rounds a price whose VAT lands exactly on .5 pesos up to the next peso', () => {
    // 5_950 * 19 / 11_900 = 9.5 exactly, exercising Math.round's half-up rule.
    expect(vatIncludedInCents(5_950)).toBe(1_000);
  });
});
