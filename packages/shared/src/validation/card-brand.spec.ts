import { CardBrand } from '../enums';
import { detectCardBrand, isSupportedBrandPrefix } from './card-brand';

describe('detectCardBrand', () => {
  it('detects VISA from a number starting with 4', () => {
    expect(detectCardBrand('4242424242424242')).toBe(CardBrand.VISA);
  });

  it('detects MASTERCARD from the old 51-55 range', () => {
    expect(detectCardBrand('5555555555554444')).toBe(CardBrand.MASTERCARD);
  });

  it('detects MASTERCARD from the new 2221-2720 range', () => {
    expect(detectCardBrand('2221000000000000')).toBe(CardBrand.MASTERCARD);
  });

  it('returns null for an unsupported prefix', () => {
    expect(detectCardBrand('3782822463100050')).toBeNull();
  });
});

describe('isSupportedBrandPrefix', () => {
  it('stays true for a VISA prefix', () => {
    expect(isSupportedBrandPrefix('4')).toBe(true);
    expect(isSupportedBrandPrefix('42')).toBe(true);
  });

  it('stays true while a Mastercard prefix is still possible', () => {
    expect(isSupportedBrandPrefix('5')).toBe(true);
    expect(isSupportedBrandPrefix('2')).toBe(true);
    expect(isSupportedBrandPrefix('22')).toBe(true);
  });

  it('turns false as soon as the prefix can no longer be VISA or Mastercard', () => {
    expect(isSupportedBrandPrefix('3')).toBe(false);
    expect(isSupportedBrandPrefix('3782')).toBe(false);
    expect(isSupportedBrandPrefix('21')).toBe(false);
    expect(isSupportedBrandPrefix('28')).toBe(false);
  });
});
