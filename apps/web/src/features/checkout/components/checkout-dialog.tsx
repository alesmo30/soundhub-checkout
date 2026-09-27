import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import {
  closeCheckout,
  selectCheckoutProductId,
  selectIsCheckoutOpen,
  selectQuantityFor,
  type CheckoutStep,
} from '../checkout.slice';
import { useCheckoutStep } from '../hooks/use-checkout-step';
import { CardForm } from './card-form';
import { ContactForm } from './contact-form';
import { OrderPanel } from './order-panel';

const MIN_QUANTITY = 1;

function CheckoutStepContent({ step }: { step: CheckoutStep }) {
  switch (step) {
    case 'CONTACT':
      return <ContactForm />;
    case 'CARD':
      return <CardForm />;
    case 'SUMMARY':
      return (
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-xl font-bold text-text-strong">Resumen de tu compra</h2>
          <p className="text-sm text-text">El resumen de la compra va aquí.</p>
        </div>
      );
  }
}

export function CheckoutDialog() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectIsCheckoutOpen);
  const productId = useAppSelector(selectCheckoutProductId);
  const quantity = useAppSelector((state) =>
    productId ? selectQuantityFor(state, productId) : MIN_QUANTITY,
  );
  const step = useCheckoutStep();

  function handleOpenChange(open: boolean) {
    if (!open) {
      dispatch(closeCheckout());
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className={
          'inset-0 top-0 left-0 h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 ' +
          'gap-4 overflow-y-auto rounded-none border-0 p-4 ' +
          'sm:max-w-none ' +
          'md:inset-auto md:top-[50%] md:left-[50%] md:h-auto md:max-h-[calc(100vh-4rem)] ' +
          'md:w-full md:max-w-[1040px] md:translate-x-[-50%] md:translate-y-[-50%] ' +
          'md:rounded-panel md:border md:border-border md:p-8'
        }
      >
        <DialogHeader>
          <DialogTitle>Pago con tarjeta</DialogTitle>
        </DialogHeader>
        {productId && (
          <div className="flex flex-1 flex-col gap-6 md:grid md:grid-cols-[320px_1fr] md:items-start md:gap-8">
            <OrderPanel productId={productId} quantity={quantity} />
            <CheckoutStepContent step={step} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
