import { CircleCheck, CircleX, Loader2 } from 'lucide-react';
import { TransactionStatus } from '@checkout/shared/enums';

import { STATUS_COPY, type StatusTone } from '../transaction.constants';

export interface StatusHeroProps {
  status: TransactionStatus;
  reference: string;
}

// Large circular icon per tone (DESIGN.md §4): mint + forest for success,
// danger for the four failed statuses, warning + spinner for PENDING.
const TONE_CIRCLE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-brand-mint text-brand-forest',
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
};

function StatusIcon({ status, tone }: { status: TransactionStatus; tone: StatusTone }) {
  if (status === TransactionStatus.PENDING) {
    return (
      <Loader2
        aria-hidden="true"
        strokeWidth={1.5}
        className="size-10 animate-spin motion-reduce:animate-none"
      />
    );
  }

  return tone === 'success' ? (
    <CircleCheck aria-hidden="true" strokeWidth={1.5} className="size-10" />
  ) : (
    <CircleX aria-hidden="true" strokeWidth={1.5} className="size-10" />
  );
}

// Icon + title + tone + the monospace reference (DESIGN.md §4, §6). The
// aria-live="polite" region wrapping this lives one level up, in
// transaction-status-page.tsx, so the same region also covers the
// breakdown, masked card and delivery status below it.
export function StatusHero({ status, reference }: StatusHeroProps) {
  const { title, tone } = STATUS_COPY[status];

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        className={`flex size-20 items-center justify-center rounded-full ${TONE_CIRCLE_CLASSES[tone]}`}
      >
        <StatusIcon status={status} tone={tone} />
      </div>
      <h1 className="font-heading text-2xl font-bold text-text-strong">{title}</h1>
      <p className="font-mono text-sm text-text">{reference}</p>
    </div>
  );
}
