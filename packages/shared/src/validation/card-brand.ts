import { CardBrand } from '../enums';

const MASTERCARD_OLD_RANGE = { low: 51, high: 55, length: 2 };
const MASTERCARD_NEW_RANGE = { low: 2221, high: 2720, length: 4 };

// `digits` is never empty here: callers only reach this once digits.length > 0.
function prefixOverlapsRange(digits: string, range: { low: number; high: number; length: number }): boolean {
  const relevant = digits.slice(0, range.length);
  const lowCandidate = Number(relevant.padEnd(range.length, '0'));
  const highCandidate = Number(relevant.padEnd(range.length, '9'));

  return lowCandidate <= range.high && highCandidate >= range.low;
}

/** Digits only (spaces already stripped). Optimistic: true while the typed
 * prefix could still complete into a VISA or Mastercard number. */
export function isSupportedBrandPrefix(digits: string): boolean {
  if (digits.length === 0 || digits[0] === '4') {
    return true;
  }

  return prefixOverlapsRange(digits, MASTERCARD_OLD_RANGE) || prefixOverlapsRange(digits, MASTERCARD_NEW_RANGE);
}

/** Digits only (spaces already stripped). Definitive: null unless enough
 * digits are present to place the number in a known range. */
export function detectCardBrand(digits: string): CardBrand | null {
  if (digits.startsWith('4')) {
    return CardBrand.VISA;
  }

  const twoDigitPrefix = Number(digits.slice(0, 2));
  if (twoDigitPrefix >= MASTERCARD_OLD_RANGE.low && twoDigitPrefix <= MASTERCARD_OLD_RANGE.high) {
    return CardBrand.MASTERCARD;
  }

  const fourDigitPrefix = Number(digits.slice(0, 4));
  if (fourDigitPrefix >= MASTERCARD_NEW_RANGE.low && fourDigitPrefix <= MASTERCARD_NEW_RANGE.high) {
    return CardBrand.MASTERCARD;
  }

  return null;
}
