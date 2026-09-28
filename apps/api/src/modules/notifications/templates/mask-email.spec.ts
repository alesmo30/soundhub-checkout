import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first local-part character and the domain', () => {
    expect(maskEmail('ana.gomez@example.com')).toBe('a***@example.com');
  });

  it('falls back to a fixed mask for a value with no domain', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
