import type { TransactionView } from '@checkout/shared/contracts';

import { formatCop } from '@/lib/money';

export interface TransactionBreakdownProps {
  view: TransactionView;
}

// Mirrors summary-breakdown.tsx's rows and formatCop usage
// (specs/11-web-payment.md#decisions, "Same label in Part 2's
// transaction-breakdown.tsx"), adapted to TransactionView.amounts: it has
// no vatIncludedInCents or delivery.rule, so the subtotal row drops the
// "IVA incluido" note and the delivery row uses a plain "Envío" label
// instead of FEE_RULE_LABEL.
export function TransactionBreakdown({ view }: TransactionBreakdownProps) {
  const { product, quantity, amounts } = view;

  return (
    <dl className="flex w-full flex-col gap-2 text-sm text-text">
      <div className="flex items-center justify-between">
        <dt className="font-semibold text-text-strong">
          {product.name} × {quantity}
        </dt>
      </div>

      <div className="flex items-center justify-between">
        <dt>Subtotal</dt>
        <dd className="font-semibold text-text-strong">{formatCop(amounts.subtotalInCents)}</dd>
      </div>

      <div className="flex items-center justify-between">
        <dt>Comisión de la pasarela de pago</dt>
        <dd className="font-semibold text-text-strong">{formatCop(amounts.baseFeeInCents)}</dd>
      </div>

      <div className="flex items-center justify-between">
        <dt>Envío</dt>
        <dd className="font-semibold text-text-strong">{formatCop(amounts.deliveryFeeInCents)}</dd>
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle pt-3">
        <dt className="font-heading text-lg font-bold text-text-strong">Total</dt>
        <dd className="font-heading text-4xl font-bold text-ink">{formatCop(amounts.totalInCents)}</dd>
      </div>
    </dl>
  );
}
