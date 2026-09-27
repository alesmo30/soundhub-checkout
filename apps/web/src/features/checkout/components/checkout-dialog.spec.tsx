import { screen } from '@testing-library/react';

import { renderWithProviders } from '@/test/render-with-providers';

import { CheckoutDialog } from './checkout-dialog';

function renderDialog(isDialogOpen: boolean) {
  return renderWithProviders(<CheckoutDialog />, {
    preloadedState: { checkout: { productId: 'product-1', quantity: 2, isDialogOpen } },
  });
}

describe('CheckoutDialog', () => {
  it('stays closed while the slice says so', () => {
    renderDialog(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens when the slice says so', () => {
    renderDialog(true);

    expect(screen.getByRole('dialog', { name: 'Pago con tarjeta' })).toBeInTheDocument();
  });

  it('dispatches closeCheckout on Escape and keeps the chosen quantity', async () => {
    const { store, user } = renderDialog(true);

    await user.keyboard('{Escape}');

    expect(store.getState().checkout).toEqual({
      productId: 'product-1',
      quantity: 2,
      isDialogOpen: false,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dispatches closeCheckout from the close button', async () => {
    const { store, user } = renderDialog(true);

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(store.getState().checkout.isDialogOpen).toBe(false);
  });
});
