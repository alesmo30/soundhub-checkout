import type { CreateTransactionRequest } from '@checkout/shared/contracts';

// See specs/11-web-payment.md#decisions ("Idempotency and recovery"):
// sessionStorage, not localStorage, so the entry dies with the tab and
// never needs a persist migration.
export const PENDING_PAYMENT_KEY = 'soundhub:pending-payment';

export interface PendingPayment {
  idempotencyKey: string;
  // Byte-for-byte what was sent to POST /transactions: the backend hashes
  // the body to detect a reused key, so this must round-trip unchanged.
  body: CreateTransactionRequest;
  savedAt: string;
}

function isPendingPayment(value: unknown): value is PendingPayment {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.idempotencyKey === 'string' &&
    typeof candidate.savedAt === 'string' &&
    typeof candidate.body === 'object' &&
    candidate.body !== null
  );
}

export function readPendingPayment(): PendingPayment | null {
  let raw: string | null;

  try {
    raw = sessionStorage.getItem(PENDING_PAYMENT_KEY);
  } catch {
    // Storage unavailable (privacy mode, blocked site data): behaves as
    // "no entry"; there is nothing to clear.
    return null;
  }

  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isPendingPayment(parsed)) {
      clearPendingPayment();

      return null;
    }

    return parsed;
  } catch {
    // Invalid JSON: an entry is there but unusable, so drop it.
    clearPendingPayment();

    return null;
  }
}

export function writePendingPayment(entry: PendingPayment): void {
  try {
    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(entry));
  } catch {
    // Storage unavailable (privacy mode, blocked site data): payment still
    // works, only the refresh recovery is lost.
  }
}

export function clearPendingPayment(): void {
  try {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY);
  } catch {
    // See writePendingPayment.
  }
}
