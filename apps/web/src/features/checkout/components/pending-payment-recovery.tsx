import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { useAppDispatch } from '@/app/hooks';
import { Button } from '@/components/ui/button';

import { closeCheckout } from '../checkout.slice';
import { PAYMENT_PROBLEM_MESSAGES, PENDING_PAYMENT_RECOVERY_NOTICE } from '../checkout.constants';
import { useCreateTransactionMutation } from '../checkout.api';
import { mapErrorToOutcome } from '../lib/payment-outcome';
import { clearPendingPayment, readPendingPayment, type PendingPayment } from '../lib/pending-payment';

// 'sending': the overlay, re-sending the stored request.
// 'uncertain': a network/timeout/5xx reply — the entry stays, "Reintentar"
// re-sends the same key and body.
// 'notice': a definitive non-201 reply — the entry is gone, and this shows
// the one-time notice instead of the generic PAYMENT_PROBLEM_MESSAGES copy
// (there is no open checkout dialog for that copy to live in after a
// refresh).
type RecoveryPhase = 'sending' | 'uncertain' | 'notice';

// Mounted once at the router root (see specs/11-web-payment.md#scope,
// "Pending payment in sessionStorage"). It simulates picking a payment back
// up after a refresh: on mount it reads whatever `soundhub:pending-payment`
// entry the tab never saw an answer for and re-sends it unchanged.
//
// It decides the three branches with `mapErrorToOutcome` — the same pure
// table `use-checkout-flow.ts` uses for the same POST /transactions
// response — instead of duplicating that switch. It does not dispatch into
// `checkoutSession` (that state is memory-only and already gone by the
// time a refresh reaches here); it only clears the stored entry and shows
// its own copy.
export function PendingPaymentRecovery() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [createTransaction] = useCreateTransactionMutation();
  const [entry, setEntry] = useState<PendingPayment | null>(() => readPendingPayment());
  const [phase, setPhase] = useState<RecoveryPhase>('sending');

  async function send(current: PendingPayment): Promise<void> {
    try {
      const { transaction } = await createTransaction({
        idempotencyKey: current.idempotencyKey,
        body: current.body,
      }).unwrap();

      clearPendingPayment();
      dispatch(closeCheckout());
      void navigate(`/transactions/${transaction.id}`);
    } catch (error) {
      const outcome = mapErrorToOutcome(error);

      if (outcome.pending === 'KEEP') {
        setPhase('uncertain');
        return;
      }

      clearPendingPayment();
      setEntry(null);
      setPhase('notice');
    }
  }

  useEffect(() => {
    if (entry) {
      // The lint rule flags this as "setState in an effect" because send()
      // can call setPhase/setEntry — but only from its catch block, after
      // the awaited createTransaction call settles, never synchronously
      // during this effect's own call stack. Re-sending an entry the tab
      // never saw an answer for is exactly the one-time, on-mount side
      // effect this hook exists for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void send(entry);
    }
    // Only the entry sessionStorage held at mount matters: a "Pagar" click
    // in this same tab writes a fresh entry for its own sendTransaction
    // call in use-checkout-flow.ts, not for this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRetry() {
    if (entry) {
      // Set from the click handler, not from send() itself: send() also
      // runs from the mount effect, where phase is already 'sending' by
      // default (see react-hooks/set-state-in-effect).
      setPhase('sending');
      void send(entry);
    }
  }

  if (phase === 'notice') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-4 top-4 z-50 rounded-panel border border-border bg-surface p-4 shadow-overlay"
      >
        <p className="text-sm font-semibold text-text-strong">{PENDING_PAYMENT_RECOVERY_NOTICE}</p>
      </div>
    );
  }

  if (!entry) {
    return null;
  }

  if (phase === 'uncertain') {
    return (
      <div
        role="alert"
        className="fixed inset-x-4 top-4 z-50 flex flex-col gap-2 rounded-panel border border-danger bg-danger/10 p-4 shadow-overlay"
      >
        <p className="text-sm font-semibold text-danger">{PAYMENT_PROBLEM_MESSAGES.UNCERTAIN}</p>
        <Button type="button" onClick={handleRetry} className="self-start">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="status"
        aria-live="polite"
        className="rounded-panel bg-surface p-6 text-center shadow-overlay"
      >
        <p className="text-base font-semibold text-text-strong">Recuperando tu pago…</p>
      </div>
    </div>
  );
}
