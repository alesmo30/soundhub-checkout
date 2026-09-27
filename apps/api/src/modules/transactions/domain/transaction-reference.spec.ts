import { REFERENCE_ALPHABET } from './transactions.constants';
import { generateReference } from './transaction-reference';

describe('generateReference', () => {
  it('uses the Bogota calendar day (UTC-5) for a purchase just after UTC midnight', () => {
    // 2026-09-28T01:00Z is 2026-09-27T20:00 in Bogota (8 pm) — still the 27th.
    const reference = generateReference(new Date('2026-09-28T01:00:00.000Z'), () => 0);

    expect(reference).toMatch(/^TX-20260927-[A-Z0-9]{6}$/);
  });

  it('uses the Bogota calendar day (UTC-5) right at the midnight boundary', () => {
    // 2026-09-27T05:00Z is 2026-09-27T00:00 in Bogota (midnight) — the 27th.
    const reference = generateReference(new Date('2026-09-27T05:00:00.000Z'), () => 0);

    expect(reference).toMatch(/^TX-20260927-[A-Z0-9]{6}$/);
  });

  it('only draws the random suffix from REFERENCE_ALPHABET', () => {
    const random = jest
      .fn<number, []>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.999);

    const reference = generateReference(new Date('2026-09-27T12:00:00.000Z'), random);
    const suffix = reference.split('-')[2] ?? '';

    expect(suffix).toHaveLength(6);

    for (const char of suffix) {
      expect(REFERENCE_ALPHABET).toContain(char);
    }
  });

  it('is reproducible for a deterministic injected random function', () => {
    const now = new Date('2026-09-27T12:00:00.000Z');
    const random = (): number => 0.5;

    expect(generateReference(now, random)).toBe(generateReference(now, random));
  });
});
