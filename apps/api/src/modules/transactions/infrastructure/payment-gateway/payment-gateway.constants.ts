import type { RetryOptions } from '../../../../shared/infrastructure/resilience/retry-with-backoff';

export const GATEWAY_TIMEOUT_MS = 8_000;
export const GATEWAY_BREAKER_FAILURE_THRESHOLD = 5;
export const GATEWAY_BREAKER_OPEN_MS = 30_000;

// `shouldRetry` is added by the adapter (only 5xx / network errors are
// retryable); the constant only pins the retry shape, per
// specs/08-api-create-transaction.md's Constants section.
export const GATEWAY_GET_RETRY = {
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 1_000,
} satisfies Omit<RetryOptions, 'shouldRetry'>;
