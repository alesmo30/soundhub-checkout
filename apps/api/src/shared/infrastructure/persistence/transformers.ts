import type { ValueTransformer } from 'typeorm';

function assertSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Value ${value} is not a safe integer`);
  }

  return value;
}

// pg returns `bigint` columns as strings, since they can exceed
// Number.MAX_SAFE_INTEGER. Money never does, so both directions assert it.
export const bigintTransformer = {
  to: (value: number | null | undefined) =>
    value === null || value === undefined ? value : assertSafeInteger(value),
  from: (value: string | null) => (value === null ? null : assertSafeInteger(Number(value))),
} satisfies ValueTransformer;

// pg also returns `numeric` columns as strings, to avoid floating-point
// rounding surprises. Coordinates are read-mostly, so a plain number is fine.
export const numericTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
} satisfies ValueTransformer;
