import { POLL_INTERVAL_MS } from '@checkout/shared/constants';

export const TRANSACTIONS_CACHE_CONTROL = 'no-store';
export const GATEWAY_UNAVAILABLE_RETRY_AFTER_SECONDS = 30; // = GATEWAY_BREAKER_OPEN_MS / 1000
export const TRANSACTION_PENDING_RETRY_AFTER_SECONDS = POLL_INTERVAL_MS / 1_000; // 2, from @checkout/shared
export const EVENT_CHECKSUM_HEADER = 'X-Event-Checksum';
export const PAYMENT_EVENT_TRANSACTION_UPDATED = 'transaction.updated';
