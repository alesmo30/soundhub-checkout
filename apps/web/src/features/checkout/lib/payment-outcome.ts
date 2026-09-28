import { ErrorCode } from '@checkout/shared/enums';

import { getErrorCode } from '@/services/api';

// See specs/11-web-payment.md#outcome-table. Pure mapping from a failed
// POST /customers or POST /transactions response to what use-checkout-flow
// (step 3) must do with the idempotency key and the pending entry, and
// which problem kind the summary should render.
export type PaymentOutcomeKind =
  | 'PRICE_CHANGED'
  | 'OUT_OF_STOCK'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'CUSTOMER_DATA_MISMATCH'
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UNCERTAIN'
  | 'FAILED';

export type IdempotencyKeyAction = 'ROTATE' | 'KEEP';
export type PendingPaymentAction = 'CLEAR' | 'KEEP';

export interface PaymentOutcome {
  kind: PaymentOutcomeKind;
  key: IdempotencyKeyAction;
  pending: PendingPaymentAction;
}

const OUTCOME_BY_CODE: Record<string, PaymentOutcome> = {
  [ErrorCode.PRICE_CHANGED]: { kind: 'PRICE_CHANGED', key: 'ROTATE', pending: 'CLEAR' },
  [ErrorCode.OUT_OF_STOCK]: { kind: 'OUT_OF_STOCK', key: 'ROTATE', pending: 'CLEAR' },
  [ErrorCode.EMAIL_ALREADY_REGISTERED]: {
    kind: 'EMAIL_ALREADY_REGISTERED',
    key: 'ROTATE',
    pending: 'CLEAR',
  },
  [ErrorCode.CUSTOMER_DATA_MISMATCH]: {
    kind: 'CUSTOMER_DATA_MISMATCH',
    key: 'ROTATE',
    pending: 'CLEAR',
  },
  [ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE]: { kind: 'UNAVAILABLE', key: 'KEEP', pending: 'CLEAR' },
  [ErrorCode.RATE_LIMITED]: { kind: 'RATE_LIMITED', key: 'KEEP', pending: 'CLEAR' },
};

// The pending entry must stay so "Reintentar" can re-send the exact same
// key and body: a lost response is not proof that nothing was charged.
const UNCERTAIN_OUTCOME: PaymentOutcome = { kind: 'UNCERTAIN', key: 'KEEP', pending: 'KEEP' };

// Nothing was created (400 / 422 / anything else with no known code), so
// the key rotates and any pending entry is discarded.
const FAILED_OUTCOME: PaymentOutcome = { kind: 'FAILED', key: 'ROTATE', pending: 'CLEAR' };

function isNetworkOrTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return true;
  }

  const { status } = error;

  return status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR' || status === 'PARSING_ERROR';
}

function getHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }

  const { status } = error;

  return typeof status === 'number' ? status : null;
}

export function mapErrorToOutcome(error: unknown): PaymentOutcome {
  if (isNetworkOrTimeout(error)) {
    return UNCERTAIN_OUTCOME;
  }

  const code = getErrorCode(error);
  const known = code === null ? undefined : OUTCOME_BY_CODE[code];

  if (known !== undefined) {
    return known;
  }

  const status = getHttpStatus(error);

  // A 5xx without a specific code (502, 504, an unmapped 500) is treated
  // the same as a network error: the customer never saw a definitive
  // answer, so nothing is discarded.
  if (status !== null && status >= 500) {
    return UNCERTAIN_OUTCOME;
  }

  return FAILED_OUTCOME;
}
