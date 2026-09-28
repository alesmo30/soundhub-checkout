// Polling cadence for /transactions/:id (specs/11-web-payment.md#scope).
// The server's Retry-After header overrides POLL_INTERVAL_MS per response;
// POLL_TIMEOUT_MS bounds how long a single window of continuous PENDING
// polls before the page moves to "under review".
export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 60_000;
