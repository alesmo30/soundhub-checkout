export interface PaymentEvent {
  readonly event: string;
  readonly providerTransactionId: string;
  readonly providerStatus: string;
  readonly statusMessage: string | null;
  readonly signature: { readonly properties: readonly string[] };
  readonly timestamp: number;
  readonly data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'string') return null;
    strings.push(item);
  }
  return strings;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// Defensive by design (see specs/12a's risk on the real payload differing
// from the documented shape): any unexpected shape returns null, which the
// controller turns into 401 INVALID_SIGNATURE rather than a 500 or a crash.
// Only the fields the webhook needs are read; anything else the gateway
// sends is never destructured.
export function parsePaymentEvent(body: unknown): PaymentEvent | null {
  if (!isRecord(body)) return null;

  const { event, data, signature, timestamp } = body;
  if (typeof event !== 'string') return null;
  if (typeof timestamp !== 'number') return null;
  if (!isRecord(data)) return null;
  if (!isRecord(signature)) return null;

  const properties = toStringArray(signature.properties);
  if (properties === null) return null;

  const transaction = data.transaction;
  if (!isRecord(transaction)) return null;

  const { id: providerTransactionId, status: providerStatus } = transaction;
  if (typeof providerTransactionId !== 'string' || providerTransactionId.length === 0) return null;
  if (typeof providerStatus !== 'string') return null;

  return {
    event,
    providerTransactionId,
    providerStatus,
    statusMessage: toNullableString(transaction.status_message),
    signature: { properties },
    timestamp,
    data,
  };
}
