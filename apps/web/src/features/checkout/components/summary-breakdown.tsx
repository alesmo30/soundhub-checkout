import type { Quote } from '@checkout/shared/contracts';
import { FeeRule } from '@checkout/shared/enums';

import { formatCop } from '@/lib/money';

import { FEE_RULE_LABEL } from '../checkout.constants';

interface SummaryBreakdownProps {
  quote: Quote;
}

// NATIONAL_DISTANCE's copy is fixed; the km figure is per-quote data (see
// specs/11-web-payment.md#copy).
function deliveryFeeLabel(quote: Quote): string {
  const label = FEE_RULE_LABEL[quote.delivery.rule];

  return quote.delivery.rule === FeeRule.NATIONAL_DISTANCE
    ? `${label} · ${quote.delivery.distanceKm} km`
    : label;
}

// Every row renders straight from the quote the summary just fetched —
// never from local math (see specs/11-web-payment.md#scope).
export function SummaryBreakdown({ quote }: SummaryBreakdownProps) {
  return (
    <dl className="flex flex-col gap-2 text-sm text-text">
      <div className="flex items-center justify-between">
        <dt className="font-semibold text-text-strong">
          {quote.product.name} × {quote.quantity}
        </dt>
      </div>

      <div className="flex items-center justify-between">
        <dt>
          Subtotal{' '}
          <span className="text-xs text-text">
            (IVA incluido {formatCop(quote.vatIncludedInCents)})
          </span>
        </dt>
        <dd className="font-semibold text-text-strong">{formatCop(quote.subtotalInCents)}</dd>
      </div>

      <div className="flex items-center justify-between">
        <dt>Comisión de la pasarela de pago</dt>
        <dd className="font-semibold text-text-strong">{formatCop(quote.baseFeeInCents)}</dd>
      </div>

      <div className="flex items-center justify-between">
        <dt>{deliveryFeeLabel(quote)}</dt>
        <dd className="font-semibold text-text-strong">{formatCop(quote.delivery.feeInCents)}</dd>
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle pt-3">
        <dt className="font-heading text-lg font-bold text-text-strong">Total</dt>
        <dd className="font-heading text-4xl font-bold text-ink">
          {formatCop(quote.totalInCents)}
        </dd>
      </div>
    </dl>
  );
}
