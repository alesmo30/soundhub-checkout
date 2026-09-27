import { bigintTransformer, numericTransformer } from './transformers';

describe('bigintTransformer', () => {
  it('reads a numeric string into a number', () => {
    expect(bigintTransformer.from('189990000')).toBe(189_990_000);
  });

  it('passes null through unchanged when reading', () => {
    expect(bigintTransformer.from(null)).toBeNull();
  });

  it('throws when reading a value above Number.MAX_SAFE_INTEGER', () => {
    const unsafe = String(Number.MAX_SAFE_INTEGER) + '0';

    expect(() => bigintTransformer.from(unsafe)).toThrow(RangeError);
  });

  it('passes a safe integer through unchanged when writing', () => {
    expect(bigintTransformer.to(189_990_000)).toBe(189_990_000);
  });

  it('throws when writing a value above Number.MAX_SAFE_INTEGER', () => {
    expect(() => bigintTransformer.to(Number.MAX_SAFE_INTEGER + 10)).toThrow(RangeError);
  });

  it('passes null and undefined through unchanged when writing', () => {
    expect(bigintTransformer.to(null)).toBeNull();
    expect(bigintTransformer.to(undefined)).toBeUndefined();
  });
});

describe('numericTransformer', () => {
  it('reads a numeric(9,6) string into a number', () => {
    expect(numericTransformer.from('6.219500')).toBe(6.2195);
  });

  it('passes null through unchanged when reading', () => {
    expect(numericTransformer.from(null)).toBeNull();
  });

  it('passes a number through unchanged when writing', () => {
    expect(numericTransformer.to(-75.584)).toBe(-75.584);
  });
});
