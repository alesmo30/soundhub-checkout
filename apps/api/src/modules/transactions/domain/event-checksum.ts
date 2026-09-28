import { createHash, timingSafeEqual } from 'node:crypto';

export interface EventChecksumInput {
  readonly data: unknown;
  readonly properties: readonly string[];
  readonly timestamp: number;
  readonly secret: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Reads a dotted path ('transaction.status') off an unknown value without
// ever throwing; a missing segment yields undefined, which stringifies to
// the empty string below — a tampered/missing signed field then changes the
// checksum instead of crashing the webhook.
function get(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    return isRecord(current) ? current[segment] : undefined;
  }, data);
}

function toChecksumString(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

// Only the fields named in `properties` (the event's own `signature.properties`)
// are trusted — see transaction.repository.port.ts's findByProviderTransactionId
// comment on why an unsigned field (e.g. a caller-supplied reference) must
// never drive a state change.
export function eventChecksum(input: EventChecksumInput): string {
  const { data, properties, timestamp, secret } = input;
  const values = properties.map((path) => toChecksumString(get(data, path))).join('');

  return createHash('sha256').update(`${values}${timestamp}${secret}`).digest('hex');
}

// A length mismatch would make timingSafeEqual throw; treated as a plain
// mismatch (false) instead, since an attacker can already observe response
// timing for an invalid length without this branch leaking anything new.
export function isValidChecksum(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
