import { createHash } from 'node:crypto';

// Recursion needs a self-reference, so this can't be typed as returning
// `unknown` without losing the array/object distinction below.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    const sortedEntries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])] as const);

    return Object.fromEntries(sortedEntries);
  }

  return value;
}

// Idempotency depends on this being stable under key reordering (the same
// body re-serialized by a different client) while still noticing an array
// element that moved (a different `payment`/`delivery` choice).
export function requestHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(body))).digest('hex');
}
