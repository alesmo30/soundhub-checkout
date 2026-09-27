import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { closeCheckout, selectIsCheckoutOpen } from '../checkout.slice';

// Stub: the card and delivery form replaces this content.
export function CheckoutDialog() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectIsCheckoutOpen);

  function handleOpenChange(open: boolean) {
    if (!open) {
      dispatch(closeCheckout());
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pago con tarjeta</DialogTitle>
          <DialogDescription>
            A continuación ingresarás tus datos de entrega y los de tu tarjeta.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
