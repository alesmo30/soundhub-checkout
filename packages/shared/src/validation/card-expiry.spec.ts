import { checkExpiry } from './card-expiry';

const NOW = new Date(2026, 8, 15); // September 15, 2026

describe('checkExpiry', () => {
  it('treats the current month as valid', () => {
    expect(checkExpiry('09/26', NOW)).toBe('VALID');
  });

  it('rejects the previous month as expired', () => {
    expect(checkExpiry('08/26', NOW)).toBe('EXPIRED');
  });

  it('accepts exactly 20 years ahead', () => {
    expect(checkExpiry('09/46', NOW)).toBe('VALID');
  });

  it('rejects more than 20 years ahead', () => {
    expect(checkExpiry('09/47', NOW)).toBe('TOO_FAR');
  });

  it('rejects a malformed value', () => {
    expect(checkExpiry('13/26', NOW)).toBe('INVALID_FORMAT');
    expect(checkExpiry('ab/26', NOW)).toBe('INVALID_FORMAT');
    expect(checkExpiry('9/26', NOW)).toBe('INVALID_FORMAT');
  });
});
