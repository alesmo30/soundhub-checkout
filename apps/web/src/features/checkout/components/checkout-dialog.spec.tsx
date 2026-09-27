import { screen } from '@testing-library/react';

import { products } from '@/mocks/fixtures/products';
import { renderWithProviders, type RenderWithProvidersOptions } from '@/test/render-with-providers';

import { CheckoutDialog } from './checkout-dialog';

const product = products.find((candidate) => candidate.sku === 'HP-SNY-WH1000XM5')!;

const REMEMBERED = {
  customer: {
    documentNumber: '1020304050',
    fullName: 'Juana Pérez',
    email: 'juana@example.com',
    phone: '3001234567',
  },
  address: {
    departmentCode: '05',
    municipalityCode: '05001',
    addressLine: 'Calle 10 # 20-30',
    addressDetail: '',
  },
};

function renderDialog(
  isDialogOpen: boolean,
  overrides?: Partial<RenderWithProvidersOptions['preloadedState']>,
) {
  return renderWithProviders(<CheckoutDialog />, {
    preloadedState: {
      checkout: { productId: product.id, quantity: 2, isDialogOpen, step: 'CONTACT' },
      ...overrides,
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

  describe('a store rebuilt from the persisted value (checkoutSession is never persisted)', () => {
    // A real "Continuar" always dispatches `goToStep('CARD')` (see
    // contact-form.spec.tsx), so that is the `step` a prior visit would have
    // left in `localStorage` regardless of "Recordarme". Only `customer`
    // (persisted) and `checkout.step` (persisted) survive a refresh;
    // `checkoutSession` (never persisted) always comes back empty.
    const PERSISTED_STEP_AFTER_CONTACT = {
      productId: product.id,
      quantity: 2,
      isDialogOpen: true,
      step: 'CARD' as const,
    };

    it('opens on CONTACT with an empty form without a remembered value', () => {
      renderDialog(true, {
        checkout: PERSISTED_STEP_AFTER_CONTACT,
        customer: { remembered: null },
      });

      expect(screen.getByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
      expect(screen.getByLabelText('Nombre completo')).toHaveValue('');
    });

    it('opens on CARD with a remembered value', () => {
      renderDialog(true, {
        checkout: PERSISTED_STEP_AFTER_CONTACT,
        customer: { remembered: REMEMBERED },
      });

      expect(screen.queryByRole('heading', { name: 'Tus datos' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Datos de tu tarjeta' })).toBeInTheDocument();
    });
  });
});
