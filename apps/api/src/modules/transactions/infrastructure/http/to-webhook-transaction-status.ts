import { TransactionStatus } from '@checkout/shared/enums';

// Every status the gateway is known to send, same anti-corruption fallback
// as gateway-response.mapper.ts's toMappedStatus: anything else (including
// EXPIRED, which the gateway itself never reports) maps to PENDING, so a
// webhook never finalizes a transaction on a guessed status. Duplicated
// rather than imported — the two mappings read different input shapes (a
// signed event field here, a parsed HTTP body there) and live behind
// different ports (references/coding-conventions.md#c3 accepts this).
const KNOWN_STATUSES: ReadonlySet<string> = new Set<TransactionStatus>([
  TransactionStatus.PENDING,
  TransactionStatus.APPROVED,
  TransactionStatus.DECLINED,
  TransactionStatus.VOIDED,
  TransactionStatus.ERROR,
]);

export function toWebhookTransactionStatus(providerStatus: string): TransactionStatus {
  return KNOWN_STATUSES.has(providerStatus)
    ? (providerStatus as TransactionStatus)
    : TransactionStatus.PENDING;
}
