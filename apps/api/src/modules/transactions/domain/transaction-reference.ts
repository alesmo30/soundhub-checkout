import {
  REFERENCE_ALPHABET,
  REFERENCE_PREFIX,
  REFERENCE_RANDOM_LENGTH,
  REFERENCE_UTC_OFFSET_HOURS,
} from './transactions.constants';

const MS_PER_HOUR = 3_600_000;

// Colombia has no DST, so the purchase day is a fixed UTC-5 shift, never a
// timezone lookup: shifting the UTC instant and reading its UTC fields back
// gives the Bogota calendar date without touching the host's local time.
function bogotaDatePart(now: Date): string {
  const bogota = new Date(now.getTime() + REFERENCE_UTC_OFFSET_HOURS * MS_PER_HOUR);
  const year = bogota.getUTCFullYear();
  const month = String(bogota.getUTCMonth() + 1).padStart(2, '0');
  const day = String(bogota.getUTCDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

function randomSuffix(random: () => number): string {
  let suffix = '';

  for (let i = 0; i < REFERENCE_RANDOM_LENGTH; i += 1) {
    const index = Math.floor(random() * REFERENCE_ALPHABET.length);
    suffix += REFERENCE_ALPHABET.charAt(index);
  }

  return suffix;
}

export function generateReference(now: Date, random: () => number): string {
  return `${REFERENCE_PREFIX}-${bogotaDatePart(now)}-${randomSuffix(random)}`;
}
