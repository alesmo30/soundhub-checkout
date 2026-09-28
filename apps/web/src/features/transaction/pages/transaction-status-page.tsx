import { useParams } from 'react-router';
import type { TransactionView } from '@checkout/shared/contracts';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { StatusActions } from '../components/status-actions';
import { StatusHero } from '../components/status-hero';
import { TransactionBreakdown } from '../components/transaction-breakdown';
import { TransactionNotFound } from '../components/transaction-not-found';
import { useTransactionPolling } from '../hooks/use-transaction-polling';
import { DELIVERY_STATUS_LABEL, UNDER_REVIEW_COPY } from '../transaction.constants';

const PAGE_CLASSES = 'mx-auto flex max-w-md flex-col items-center gap-4 py-6 text-center';

function StatusPageSkeleton() {
  return (
    <div aria-busy="true" className={PAGE_CLASSES}>
      <p role="status" className="sr-only">
        Cargando el estado de tu pago…
      </p>
      <div aria-hidden="true" className="flex w-full flex-col items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

interface TransactionSummaryProps {
  view: TransactionView;
}

// The hero, the breakdown, the masked card and the delivery status label —
// the group every non-terminal and terminal phase below renders the same
// way (DESIGN.md §4). Never renders `view.statusMessage` (CLAUDE.md;
// specs/11-web-payment.md#scope).
function TransactionSummary({ view }: TransactionSummaryProps) {
  return (
    <>
      <StatusHero status={view.status} reference={view.reference} />
      <TransactionBreakdown view={view} />
      <p className="font-mono text-base text-text">
        {view.card.brand} •••• {view.card.last4}
      </p>
      <p className="text-sm font-semibold text-text-strong">
        {DELIVERY_STATUS_LABEL[view.delivery.status]}
      </p>
    </>
  );
}

// Polls the id from the URL alone (useTransactionPolling), so a refresh or
// a shared link always shows the same result with no stored state
// (specs/11-web-payment.md#acceptance-criteria, "Final status"). The whole
// non-terminal/terminal content sits in one aria-live="polite" region
// (DESIGN.md §4); `not-found` renders its own page outside that region.
export function TransactionStatusPage() {
  const { id = '' } = useParams<{ id: string }>();
  const polling = useTransactionPolling(id);

  if (polling.phase === 'not-found') {
    return <TransactionNotFound />;
  }

  if (polling.phase === 'loading') {
    return <StatusPageSkeleton />;
  }

  if (polling.phase === 'under-review') {
    return (
      <section role="status" aria-live="polite" className={PAGE_CLASSES}>
        {polling.view && <TransactionSummary view={polling.view} />}
        <p className="text-base font-semibold text-text-strong">{UNDER_REVIEW_COPY}</p>
        <Button type="button" onClick={() => polling.restart()}>
          Actualizar
        </Button>
      </section>
    );
  }

  const { view } = polling;

  return (
    <section role="status" aria-live="polite" className={PAGE_CLASSES}>
      <TransactionSummary view={view} />
      {polling.phase === 'final' && <StatusActions view={view} />}
    </section>
  );
}
