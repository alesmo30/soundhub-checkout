import { screen } from '@testing-library/react';

import { products } from '@/mocks/fixtures/products';
import { renderWithProviders } from '@/test/render-with-providers';

import { CheckoutDialog } from './checkout-dialog';

const product = products.find((candidate) => candidate.sku === 'HP-SNY-WH1000XM5')!;

function renderDialog(isDialogOpen: boolean) {
  return renderWithProviders(<CheckoutDialog />, {
    preloadedState: {
      checkout: { productId: product.id, quantity: 2, isDialogOpen, step: 'CONTACT' },
    },
  });
}

describe('CheckoutDialog', () => {
  it('stays closed while the slice says so', () => {
    renderDialog(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the desktop order panel and the mobile summary line', async () => {
    renderDialog(true);

    const desktopPanel = await screen.findByTestId('order-panel-desktop');
    const mobilePanel = screen.getByTestId('order-panel-mobile');

    expect(desktopPanel).toHaveClass('hidden', 'md:flex');
    expect(mobilePanel).toHaveClass('md:hidden');
    expect(await screen.findByText(product.name, { selector: 'p' })).toBeInTheDocument();
  });

  it('renders the contact form as the current sub-step', () => {
    renderDialog(true);

    expect(screen.getByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entrega' })).toBeInTheDocument();
  });

  it('dispatches closeCheckout on Escape and keeps the chosen quantity', async () => {
    const { store, user } = renderDialog(true);

    await user.keyboard('{Escape}');

    expect(store.getState().checkout).toEqual({
      productId: product.id,
      quantity: 2,
      isDialogOpen: false,
      step: 'CONTACT',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dispatches closeCheckout from the close button', async () => {
    const { store, user } = renderDialog(true);

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(store.getState().checkout.isDialogOpen).toBe(false);
  });
});
