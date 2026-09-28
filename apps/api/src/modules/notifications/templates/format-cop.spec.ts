import { formatCop } from './format-cop';

// Intl.NumberFormat('es-CO') separates the symbol with a non-breaking space
// (U+00A0), not a regular space — these literals must match that exactly.
describe('formatCop', () => {
  it('formats cents as es-CO currency with no decimals', () => {
    expect(formatCop(392_046_000)).toBe('$ 3.920.460');
  });

  it('formats zero', () => {
    expect(formatCop(0)).toBe('$ 0');
  });
});
