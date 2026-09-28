import { useNavigate } from 'react-router';
import { TransactionStatus } from '@checkout/shared/enums';
import type { TransactionView } from '@checkout/shared/contracts';

import { useAppDispatch } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { invalidateProduct } from '@/features/catalog';
import {
  clearCheckoutSession,
  closeCheckout,
  goToStep,
  resetCheckout,
  startCheckout,
} from '@/features/checkout';

export interface StatusActionsProps {
  view: TransactionView;
}

// "Volver al producto" and, on a failed status, "Intentar con otra
// tarjeta" (specs/11-web-payment.md#scope, "Final status" and #decisions,
// "Final status"). Only APPROVED shows the single "Volver al producto"
// action; every other final status here (DECLINED, ERROR, VOIDED, EXPIRED —
// PENDING never reaches this component, see transaction-status-page.tsx's
// 'final' phase) shows both, with "Intentar con otra tarjeta" primary.
export function StatusActions({ view }: StatusActionsProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const productId = view.product.id;
  const isApproved = view.status === TransactionStatus.APPROVED;

  // Invalidates the product cache, resets the checkout slice and clears
  // checkoutSession entirely — but never the remembered-customer data,
  // which lives in the separate `customer` slice untouched by
  // clearCheckoutSession (see checkout-session.slice.ts).
  function handleBackToProduct(): void {
    dispatch(invalidateProduct(productId));
    dispatch(resetCheckout());
    dispatch(clearCheckoutSession());
    void navigate(`/products/${productId}`);
  }

  // Reopens the checkout on the same product and quantity, at the CARD
  // step, with a fresh card and acceptance tokens (closeCheckout drops
  // them) and the contact kept (closeCheckout never touches `contact`).
  function handleTryAnotherCard(): void {
    dispatch(invalidateProduct(productId));
    dispatch(closeCheckout());
    dispatch(startCheckout({ productId, quantity: view.quantity }));
    dispatch(goToStep('CARD'));
    void navigate(`/products/${productId}`);
  }

  if (isApproved) {
    return (
      <Button type="button" onClick={handleBackToProduct}>
        Volver al producto
      </Button>
    );
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <Button
        type="button"
        onClick={handleTryAnotherCard}
        className="h-auto min-h-14 w-full py-3 text-center whitespace-normal"
      >
        Intentar con otra tarjeta
      </Button>
      <Button type="button" variant="link" onClick={handleBackToProduct}>
        Volver al producto
      </Button>
    </div>
  );
}
