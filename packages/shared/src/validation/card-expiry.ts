const CARD_EXPIRY_MAX_YEARS_AHEAD = 20;
const EXPIRY_FORMAT_PATTERN = /^(0[1-9]|1[0-2])\/([0-9]{2})$/;

export type ExpiryCheckResult = 'VALID' | 'INVALID_FORMAT' | 'EXPIRED' | 'TOO_FAR';

/** `value` is `MM/YY`. `now` is injected so tests can fix the date. */
export function checkExpiry(value: string, now: Date): ExpiryCheckResult {
  const match = EXPIRY_FORMAT_PATTERN.exec(value);
  if (!match) {
    return 'INVALID_FORMAT';
  }

  const month = Number(match[1]);
  const century = Math.floor(now.getFullYear() / 100) * 100;
  const year = century + Number(match[2]);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return 'EXPIRED';
  }

  const maxYear = currentYear + CARD_EXPIRY_MAX_YEARS_AHEAD;
  if (year > maxYear || (year === maxYear && month > currentMonth)) {
    return 'TOO_FAR';
  }

  return 'VALID';
}
