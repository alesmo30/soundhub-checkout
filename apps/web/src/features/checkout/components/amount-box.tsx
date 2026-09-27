import { CircleCheck } from 'lucide-react';
import { Link } from 'react-router';
import { skipToken } from '@reduxjs/toolkit/query/react';
import type { Quote } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import { useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetProductQuery } from '@/features/catalog';
import { formatCop } from '@/lib/money';
import { getErrorCode } from '@/services/api';

import { useGetQuoteQuery } from '../checkout.api';
import { selectQuoteMunicipality } from '../checkout.selectors';

interface AmountBoxProps {
  productId: string;
  quantity: number;
  // The order panel collapses into a single line on mobile; this box then
  // contributes only the trailing total, not the full "¿Cuánto vas a
  // pagar?" block (see specs/07-web-checkout.md#ui-rules, Order panel row).
  compact?: boolean;
}

type AmountStatus =
  | { kind: 'noMunicipality' }
  | { kind: 'loading' }
  | { kind: 'outOfStock'; unitsLeft: number }
  | { kind: 'error' }
  | { kind: 'success'; quote: Quote };

interface AmountStatusResult {
  status: AmountStatus;
  refetch: () => void;
}

function useAmountStatus(productId: string, quantity: number): AmountStatusResult {
  const municipalityCode = useAppSelector(selectQuoteMunicipality);
  const { data: product } = useGetProductQuery(productId);
  const {
    data: quote,
    isLoading,
    isError,
    error,
    refetch: refetchQuote,
  } = useGetQuoteQuery(municipalityCode ? { productId, quantity, municipalityCode } : skipToken, {
    refetchOnMountOrArgChange: true,
  });

  // RTK Query's refetch resolves a query-result promise; callers here only
  // ever fire-and-forget it from a click handler.
  const refetch = (): void => {
    void refetchQuote();
  };

  if (!municipalityCode) {
    return { status: { kind: 'noMunicipality' }, refetch };
  }

  if (isLoading) {
    return { status: { kind: 'loading' }, refetch };
  }

  if (isError) {
    if (product && getErrorCode(error) === ErrorCode.OUT_OF_STOCK) {
      return { status: { kind: 'outOfStock', unitsLeft: product.stockAvailable }, refetch };
    }

    return { status: { kind: 'error' }, refetch };
  }

  return { status: quote ? { kind: 'success', quote } : { kind: 'loading' }, refetch };
}

export function AmountBox({ productId, quantity, compact = false }: AmountBoxProps) {
  const { status, refetch } = useAmountStatus(productId, quantity);

  if (compact) {
    return <CompactAmount status={status} />;
  }

  return (
    <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4">
      <p className="text-xs font-bold text-text uppercase">¿Cuánto vas a pagar?</p>
      <AmountContent status={status} productId={productId} refetch={refetch} />
    </div>
  );
}

function CompactAmount({ status }: { status: AmountStatus }) {
  switch (status.kind) {
    case 'noMunicipality':
      return null;
    case 'loading':
      return <Skeleton className="h-5 w-24" />;
    case 'error':
    case 'outOfStock':
      return <span className="text-xs font-semibold text-danger">No pudimos calcular el total.</span>;
    case 'success':
      return (
        <span className="font-heading text-base font-bold text-ink">
          {formatCop(status.quote.totalInCents)}
        </span>
      );
  }
}

interface AmountContentProps {
  status: AmountStatus;
  productId: string;
  refetch: () => void;
}

function AmountContent({ status, productId, refetch }: AmountContentProps) {
  switch (status.kind) {
    case 'noMunicipality':
      return <p className="text-sm text-text">Selecciona tu municipio para calcular el total</p>;

    case 'loading':
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-40" />
          <p className="text-sm text-text">Calculando total…</p>
        </div>
      );

    case 'outOfStock':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-danger">
            Solo quedan {status.unitsLeft} unidades. Vuelve al producto para ajustar la cantidad.
          </p>
          <Link
            to={`/products/${productId}`}
            className="text-sm font-semibold text-brand-forest underline underline-offset-4"
          >
            Ver producto
          </Link>
        </div>
      );

    case 'error':
      return (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm font-semibold text-danger">
            No pudimos calcular el total.
          </p>
          <Button variant="secondary" size="compact" onClick={refetch}>
            Reintentar
          </Button>
        </div>
      );

    case 'success':
      return (
        <div className="flex items-center gap-2">
          <CircleCheck aria-hidden="true" strokeWidth={1.5} className="size-6 text-brand-forest" />
          <p className="font-heading text-4xl font-bold text-ink">
            {formatCop(status.quote.totalInCents)}
          </p>
        </div>
      );
  }
}
