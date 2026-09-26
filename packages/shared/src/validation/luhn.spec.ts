import { isValidLuhn } from './luhn';

describe('isValidLuhn', () => {
  it('accepts a valid card number', () => {
    expect(isValidLuhn('4242424242424242')).toBe(true);
  });

  it('rejects a number that fails the checksum', () => {
    expect(isValidLuhn('4242424242424241')).toBe(false);
  });

  it('carries the doubled-digit overflow correctly (digit > 9)', () => {
    expect(isValidLuhn('4012888888881881')).toBe(true);
  });
});
