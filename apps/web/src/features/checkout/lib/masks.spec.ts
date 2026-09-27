import { digitsOnly, formatCardNumber, formatExpiry } from './masks';

describe('digitsOnly', () => {
  it.each([
    ['4242 4242 4242 4242', '4242424242424242'],
    ['abc123', '123'],
    ['12/29', '1229'],
    ['', ''],
    ['---', ''],
  ])('%s -> %s', (input, expected) => {
    expect(digitsOnly(input)).toBe(expected);
  });
});

describe('formatCardNumber', () => {
  it.each([
    ['4242424242424242', '4242 4242 4242 4242'],
    ['4242', '4242'],
    ['42424', '4242 4'],
    ['4242 4242 4242 4242', '4242 4242 4242 4242'],
    ['4242-4242-4242-4242', '4242 4242 4242 4242'],
    ['42424242424242424242', '4242 4242 4242 4242'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(formatCardNumber(input)).toBe(expected);
  });
});

describe('formatExpiry', () => {
  it.each([
    ['1229', '12/29'],
    ['1', '1'],
    ['12', '12'],
    ['12/29', '12/29'],
    ['123456', '12/34'],
    ['12-29', '12/29'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(formatExpiry(input)).toBe(expected);
  });
});
