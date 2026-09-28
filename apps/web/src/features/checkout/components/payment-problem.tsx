import { Button } from '@/components/ui/button';
import { formatCop } from '@/lib/money';

import type { PaymentProblem as PaymentProblemState } from '../checkout-session.slice';
import { PAYMENT_PROBLEM_MESSAGES } from '../checkout.constants';

export interface PaymentProblemProps {
  problem: PaymentProblemState;
  // The fresh quote's current total; only PRICE_CHANGED needs it, to
  // highlight it next to the previous one (see specs/11-web-payment.md
  // #outcome-table).
  currentTotalInCents: number;
  onAdjustQuantity: () => void;
  onRetry: () => void;
}

// role="alert" + the copy and action for the given `paymentProblem.kind`
// (see specs/11-web-payment.md#outcome-table). Never renders the gateway's
// raw status message — only fixed copy keyed by code.
export function PaymentProblem({
  problem,
  currentTotalInCents,
  onAdjustQuantity,
  onRetry,
}: PaymentProblemProps) {
  switch (problem.kind) {
    case 'PRICE_CHANGED':
      return (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-panel border border-warning bg-warning/10 p-4"
        >
          <p className="text-sm font-semibold text-text-strong">
            El total cambió de{' '}
            <span className="line-through">{formatCop(problem.previousTotalInCents)}</span> a{' '}
            <span className="font-bold text-text-strong">{formatCop(currentTotalInCents)}</span>.
            Revisa el nuevo valor antes de pagar.
          </p>
        </div>
      );

    case 'OUT_OF_STOCK':
      return (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-panel border border-danger bg-danger/10 p-4"
        >
          <p className="text-sm font-semibold text-danger">
            {PAYMENT_PROBLEM_MESSAGES.OUT_OF_STOCK}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={onAdjustQuantity}
            className="self-start"
          >
            Ajustar cantidad
          </Button>
        </div>
      );

    case 'UNAVAILABLE':
      return (
        <p role="alert" className="text-sm font-semibold text-danger">
          {PAYMENT_PROBLEM_MESSAGES.UNAVAILABLE}
        </p>
      );

    case 'RATE_LIMITED':
      return (
        <p role="alert" className="text-sm font-semibold text-danger">
          {PAYMENT_PROBLEM_MESSAGES.RATE_LIMITED}
        </p>
      );

    case 'UNCERTAIN':
      return (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-panel border border-danger bg-danger/10 p-4"
        >
          <p className="text-sm font-semibold text-danger">{PAYMENT_PROBLEM_MESSAGES.UNCERTAIN}</p>
          <Button type="button" onClick={onRetry} className="self-start">
            Reintentar
          </Button>
        </div>
      );

    case 'FAILED':
      return (
        <p role="alert" className="text-sm font-semibold text-danger">
          {PAYMENT_PROBLEM_MESSAGES.FAILED}
        </p>
      );
  }
}
