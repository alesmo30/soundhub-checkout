import { CardBrand, TransactionStatus } from '@checkout/shared/enums';

import type { GatewayCharge } from '../../application/ports/payment-gateway.port';

type MappedStatus = GatewayCharge['status'];

// Every real status the gateway is known to send (see
// docs/design/gateway-findings.md); everything else falls back to PENDING
// so a transaction is never finalized on a guessed status.
const KNOWN_STATUSES: ReadonlySet<string> = new Set<MappedStatus>([
  TransactionStatus.PENDING,
  TransactionStatus.APPROVED,
  TransactionStatus.DECLINED,
  TransactionStatus.VOIDED,
  TransactionStatus.ERROR,
]);

const KNOWN_CARD_BRANDS: ReadonlySet<string> = new Set(Object.values(CardBrand));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// A wrapper typed as `unknown[]` (not `any[]`) so destructuring its result
// never produces an implicit `any` binding downstream.
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function toMappedStatus(rawStatus: unknown): MappedStatus {
  return typeof rawStatus === 'string' && KNOWN_STATUSES.has(rawStatus)
    ? (rawStatus as MappedStatus)
    : TransactionStatus.PENDING;
}

function toCardBrand(value: unknown): CardBrand | null {
  return typeof value === 'string' && KNOWN_CARD_BRANDS.has(value) ? (value as CardBrand) : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toProviderTransactionId(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Reads only the fields GatewayCharge needs. Anything else the provider
// sends (merchant, entries, disbursement, refunds, three_ds_auth, …) is
// never destructured, so it cannot leak into the result or make this throw
// regardless of its shape (see gateway-findings.md's "Differences" section).
function toGatewayChargeFromChargeData(data: unknown): GatewayCharge {
  const charge = isRecord(data) ? data : {};
  const paymentMethod = isRecord(charge.payment_method) ? charge.payment_method : {};
  const extra = isRecord(paymentMethod.extra) ? paymentMethod.extra : {};

  return {
    providerTransactionId: toProviderTransactionId(charge.id),
    status: toMappedStatus(charge.status),
    statusMessage: toNullableString(charge.status_message),
    cardBrand: toCardBrand(extra.brand),
    cardLast4: toNullableString(extra.last_four),
  };
}

/**
 * Maps a raw `POST /transactions` or `GET /transactions/{id}` response body
 * (`{ data: {...} }`) into the port's `GatewayCharge`.
 */
export function toGatewayCharge(rawBody: unknown): GatewayCharge {
  const body = isRecord(rawBody) ? rawBody : {};
  return toGatewayChargeFromChargeData(body.data);
}

/**
 * Maps a `GET /transactions?reference=` response, which the gateway always
 * wraps in an array even for a single match (see gateway-findings.md),
 * to the first match or `null` when there are none.
 */
export function toGatewayChargeFromReferenceLookup(rawBody: unknown): GatewayCharge | null {
  const body = isRecord(rawBody) ? rawBody : {};
  const rows = isUnknownArray(body.data) ? body.data : [];
  const [first] = rows;
  return first === undefined ? null : toGatewayChargeFromChargeData(first);
}
