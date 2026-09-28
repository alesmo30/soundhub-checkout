// The lease a claimed row holds before another reconciler run may reclaim
// it: the bumped updated_at is checked against `now - RECONCILER_LEASE_MS`.
// = the "older than 1 min" of the sync task (docs/design — FR-24).
export const RECONCILER_LEASE_MS = 60_000;

// Shared by the sync and safe-expiry tasks. One worst-case gateway call
// (~25 s) after the budget runs out still finishes before the 60 s lease
// above, so a run can never outlive its own lease.
export const RECONCILER_TIME_BUDGET_MS = 30_000;

// Per task, per run.
export const RECONCILER_BATCH_SIZE = 20;

// A finalized transaction becomes eligible for re-publish once it has been
// unsent this long.
export const EMAIL_REPUBLISH_AFTER_MS = 300_000;

// At most one re-publish per transaction every this many ms, regardless of
// how often the reconciler runs.
export const EMAIL_REPUBLISH_LEASE_MS = 300_000;

export const EXPIRED_STATUS_MESSAGE = 'Reservation expired before reaching the payment gateway';
