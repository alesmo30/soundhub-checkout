import { useEffect } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCop } from '@/lib/money';

import {
  ensureIdempotencyKey,
  rotateIdempotencyKey,
  selectCard,
  selectPaymentProblem,
} from '../checkout-session.slice';
import { selectContactDetails, selectQuoteMunicipality } from '../checkout.selectors';
import { closeCheckout, goToStep } from '../checkout.slice';
import { useGetMunicipalitiesQuery, useGetQuoteQuery } from '../checkout.api';
import { useCheckoutFlow } from '../hooks/use-checkout-flow';
import { useIsDesktop } from '../hooks/use-is-desktop';
import { PaymentProblem } from './payment-problem';
import { SummaryBreakdown } from './summary-breakdown';

export interface SummarySheetProps {
  productId: string;
  quantity: number;
}

// A layer on top of the checkout dialog — a Drawer (bottom sheet) below
// `md`, a Dialog from `md` (see specs/11-web-payment.md#decisions,
// "Summary layout"). Mounted only while the effective step is SUMMARY, so
// every open re-fetches the quote fresh (see specs/11-web-payment.md
// #scope).
export function SummarySheet({ productId, quantity }: SummarySheetProps) {
  const dispatch = useAppDispatch();
  const isDesktop = useIsDesktop();
  const contact = useAppSelector(selectContactDetails);
  const card = useAppSelector(selectCard);
  const municipalityCode = useAppSelector(selectQuoteMunicipality);
  const paymentProblem = useAppSelector(selectPaymentProblem);
  const { isPaying, pay, retry } = useCheckoutFlow();

  // The key is created here, not earlier: the summary is the first screen
  // whose "Pagar" click actually sends a request (see specs/11-web-payment.md
  // #scope, "Idempotency key").
  useEffect(() => {
    dispatch(ensureIdempotencyKey());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: quote, isLoading: isQuoteLoading } = useGetQuoteQuery(
    municipalityCode ? { productId, quantity, municipalityCode } : skipToken,
    { refetchOnMountOrArgChange: true },
  );

  const departmentCode = contact?.address.departmentCode ?? '';
  const { data: municipalities = [] } = useGetMunicipalitiesQuery(departmentCode, {
    skip: !departmentCode,
  });
  const municipalityName = municipalities.find(
    (municipality) => municipality.code === contact?.address.municipalityCode,
  )?.name;

  function handleOpenChange(open: boolean) {
    // Esc and a backdrop click close only this layer: the checkout dialog
    // underneath stays open, on CARD (see specs/11-web-payment.md#scope,
    // step 4's manual test).
    if (!open) {
      dispatch(goToStep('CARD'));
    }
  }

  function handleEditar() {
    dispatch(rotateIdempotencyKey());
    dispatch(goToStep('CARD'));
  }

  function handleAdjustQuantity() {
    dispatch(closeCheckout());
  }

  function handlePagar() {
    if (!quote) {
      return;
    }

    void pay(quote);
  }

  function handleRetry() {
    void retry();
  }

  const isOutOfStock = paymentProblem?.kind === 'OUT_OF_STOCK';
  const isUncertain = paymentProblem?.kind === 'UNCERTAIN';
  const isPayDisabled = isQuoteLoading || isPaying || !quote;
  const payLabel = isPaying
    ? 'Procesando pago…'
    : `Pagar${quote ? ` ${formatCop(quote.totalInCents)}` : ''}`;

  const body = (
    <div className="flex flex-col gap-4">
      {isQuoteLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
      )}

      {quote && <SummaryBreakdown quote={quote} />}

      {card && (
        <p className="font-mono text-base text-text">
          {card.brand} •••• {card.last4}
        </p>
      )}

      {contact && (
        <address className="text-sm text-text not-italic">
          {contact.address.addressLine}
          {contact.address.addressDetail ? `, ${contact.address.addressDetail}` : ''}
          {municipalityName ? `, ${municipalityName}` : ''}
        </address>
      )}

      {paymentProblem && (
        <PaymentProblem
          problem={paymentProblem}
          currentTotalInCents={quote?.totalInCents ?? 0}
          onAdjustQuantity={handleAdjustQuantity}
          onRetry={handleRetry}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        {!isUncertain && (
          <Button type="button" variant="secondary" onClick={handleEditar}>
            Editar
          </Button>
        )}
        {!isUncertain && !isOutOfStock && (
          <Button type="button" onClick={handlePagar} disabled={isPayDisabled} className="flex-1">
            {payLabel}
          </Button>
        )}
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Resumen de tu pago</DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    // handleOnly: the summary has no drag handle, so nothing but a real
    // click on it starts a swipe-to-dismiss (there is no
    // <Drawer.Handle /> to grab); "Editar", "Pagar" and the rest stay
    // ordinary buttons instead of drag targets.
    <Drawer open onOpenChange={handleOpenChange} handleOnly>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Resumen de tu pago</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}
