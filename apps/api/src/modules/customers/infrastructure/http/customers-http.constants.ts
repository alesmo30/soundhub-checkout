export const CUSTOMERS_CACHE_CONTROL = 'no-store';

// Inert until api 07 registers ThrottlerModule and a guard; for now it only
// attaches metadata to POST /customers so the guard has something to read later.
export const CUSTOMERS_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
