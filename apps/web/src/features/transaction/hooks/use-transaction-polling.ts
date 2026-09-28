import { useEffect, useState } from 'react';
import type { TransactionView } from '@checkout/shared/contracts';
import { TransactionStatus } from '@checkout/shared/enums';

import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../transaction.constants';
import { useLazyGetTransactionQuery } from '../transaction.api';

export type PollingState =
  | { phase: 'loading' }
  | { phase: 'pending'; view: TransactionView }
  | { phase: 'final'; view: TransactionView }
  | { phase: 'under-review'; view: TransactionView | null; restart(): void }
  | { phase: 'not-found' };

// 404 (unknown id) and 400 (malformed id) never resolve into a transaction;
// every other failure (network, 5xx incl. 504, 429) is transient and must
// not change what the customer sees (specs/11-web-payment.md#decisions,
// "Final status"). Mirrors services/api.ts's isProblemDetails narrowing,
// but only the numeric status matters here.
function isDefinitiveNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return false;
  }

  return error.status === 404 || error.status === 400;
}

// Polls GET /transactions/:id until a final status, inside a
// POLL_TIMEOUT_MS window from mount or from the last restart(). Starts
// fresh from `id` alone on every mount, so a refresh or a shared link
// never depends on stored state.
//
// Driven by an imperative `trigger()` (useLazyGetTransactionQuery) rather
// than the declarative `pollingInterval` option: RTK Query applies
// structural sharing to successful responses, so two PENDING replies with
// identical content (the common case here) collapse to the *same*
// `currentData` reference and never re-trigger an effect keyed on it.
// Reading the result straight from each `trigger()` promise sidesteps
// that, and also sidesteps RTK Query's own poll scheduler, which only
// ever *shortens* an already-scheduled poll — it cannot express "wait
// the server's Retry-After" once that is longer than the default.
export function useTransactionPolling(id: string): PollingState {
  const [restartToken, setRestartToken] = useState(0);
  const [lastView, setLastView] = useState<TransactionView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const [trigger] = useLazyGetTransactionQuery();

  // Resets on every mount and every restart(). Adjusted during render
  // (React's documented pattern for "reset state when a key changes")
  // rather than in an effect, so it takes effect before the poll and
  // window-timeout effects below ever see the stale values.
  const resetKey = `${id}:${restartToken}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);

  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setLastView(null);
    setNotFound(false);
    setTimedOut(false);
  }

  useEffect(() => {
    if (timedOut) {
      return;
    }

    const timer = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [id, restartToken, timedOut]);

  useEffect(() => {
    if (timedOut || notFound) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(intervalMs: number): Promise<void> {
      const result = await trigger(id);

      if (cancelled) {
        return;
      }

      if (result.error) {
        if (isDefinitiveNotFound(result.error)) {
          setNotFound(true);
          return;
        }

        // Transient failure: ignored, but the next attempt still needs to
        // be scheduled, at the last known interval.
        timer = setTimeout(() => void poll(intervalMs), intervalMs);
        return;
      }

      if (!result.data) {
        return;
      }

      setLastView(result.data.view);

      if (result.data.view.status !== TransactionStatus.PENDING) {
        return;
      }

      const nextIntervalMs = result.data.retryAfterMs ?? POLL_INTERVAL_MS;

      timer = setTimeout(() => void poll(nextIntervalMs), nextIntervalMs);
    }

    void poll(POLL_INTERVAL_MS);

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [id, restartToken, trigger, timedOut, notFound]);

  function restart(): void {
    setRestartToken((token) => token + 1);
  }

  if (notFound) {
    return { phase: 'not-found' };
  }

  if (lastView && lastView.status !== TransactionStatus.PENDING) {
    return { phase: 'final', view: lastView };
  }

  if (timedOut) {
    return { phase: 'under-review', view: lastView, restart };
  }

  if (lastView) {
    return { phase: 'pending', view: lastView };
  }

  return { phase: 'loading' };
}
