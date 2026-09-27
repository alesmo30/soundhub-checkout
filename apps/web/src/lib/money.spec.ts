import { formatCop } from './money';

const NON_BREAKING_SPACE = ' ';

describe('formatCop', () => {
  it('formats 18999000 cents as "$ 189.990"', () => {
    expect(formatCop(18_999_000)).toBe(`$${NON_BREAKING_SPACE}189.990`);
  });

  it('formats 0 cents as "$ 0"', () => {
    expect(formatCop(0)).toBe(`$${NON_BREAKING_SPACE}0`);
  });

  it('formats 392046000 cents as "$ 3.920.460"', () => {
    expect(formatCop(392_046_000)).toBe(`$${NON_BREAKING_SPACE}3.920.460`);
  });
});
