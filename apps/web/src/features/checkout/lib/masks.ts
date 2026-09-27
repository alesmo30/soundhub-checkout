const CARD_NUMBER_GROUP_SIZE = 4;
const CARD_NUMBER_MAX_DIGITS = 16;
const EXPIRY_MONTH_LENGTH = 2;
const EXPIRY_MAX_DIGITS = 4;
const DIGITS_ONLY_PATTERN = /\D/g;
const CARD_NUMBER_GROUP_PATTERN = new RegExp(`.{1,${CARD_NUMBER_GROUP_SIZE}}`, 'g');

/** Strips everything but digits. Used to read the raw value back out of a
 * masked display string, and as the building block for the other masks. */
export function digitsOnly(value: string): string {
  return value.replace(DIGITS_ONLY_PATTERN, '');
}

/** 4-4-4-4 mask, e.g. `4242424242424242` -> `4242 4242 4242 4242`. Digits
 * past the 16th are dropped rather than wrapped into a 5th group. */
export function formatCardNumber(value: string): string {
  const digits = digitsOnly(value).slice(0, CARD_NUMBER_MAX_DIGITS);

  return digits.match(CARD_NUMBER_GROUP_PATTERN)?.join(' ') ?? '';
}

/** Inserts the `/` between MM and AA as the user types, e.g. `1229` ->
 * `12/29`. Digits past the 4th are dropped. */
export function formatExpiry(value: string): string {
  const digits = digitsOnly(value).slice(0, EXPIRY_MAX_DIGITS);

  if (digits.length <= EXPIRY_MONTH_LENGTH) {
    return digits;
  }

  return `${digits.slice(0, EXPIRY_MONTH_LENGTH)}/${digits.slice(EXPIRY_MONTH_LENGTH)}`;
}
