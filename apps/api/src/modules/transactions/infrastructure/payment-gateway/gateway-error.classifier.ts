import type { PaymentGatewayError } from '../../application/ports/payment-gateway.port';

const DEFAULT_REJECTED_MESSAGE = 'The payment gateway rejected the request';
const DEFAULT_UNAVAILABLE_MESSAGE = 'The payment gateway is unavailable';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// A wrapper typed as `unknown[]` (not `any[]`) so destructuring its result
// never produces an implicit `any` binding downstream.
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// The gateway's validation error nests one message array per rejected
// field two levels deep: error.messages.<field>.messages.<field>[] (see
// docs/design/gateway-findings.md, e.g. payment_method.messages.token[]).
// Other 4xx shapes (an auth failure has no field to nest under) simply have
// no match here, so the caller falls back to a generic message.
function firstNestedFieldMessage(messages: unknown): string | null {
  if (!isRecord(messages)) return null;

  for (const outer of Object.values(messages)) {
    if (!isRecord(outer) || !isRecord(outer.messages)) continue;

    for (const inner of Object.values(outer.messages)) {
      const [first] = isUnknownArray(inner) ? inner : [];
      if (typeof first === 'string') return first;
    }
  }

  return null;
}

function toRejectedMessage(body: unknown): string {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const nestedMessage = firstNestedFieldMessage(error.messages);
  if (nestedMessage !== null) return nestedMessage;

  return typeof error.type === 'string' ? error.type : DEFAULT_REJECTED_MESSAGE;
}

/**
 * Classifies a non-2xx `POST /transactions` (or GET) response by HTTP
 * status: any 4xx is definitive (the gateway refused before creating a
 * charge) and any 5xx is uncertain — see the status-mapping table in
 * specs/08-api-create-transaction.md. TIMEOUT is synthesized by the HTTP
 * adapter from an actual timeout, never from a status code, so it is not
 * produced here.
 */
export function classifyGatewayError(status: number, body: unknown): PaymentGatewayError {
  if (status >= 500) {
    return { kind: 'UNAVAILABLE', message: DEFAULT_UNAVAILABLE_MESSAGE };
  }

  return { kind: 'REJECTED', message: toRejectedMessage(body) };
}
