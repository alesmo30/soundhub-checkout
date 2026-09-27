import { act, screen } from '@testing-library/react';

import { products } from '@/mocks/fixtures/products';
import { renderWithProviders, type RenderWithProvidersOptions } from '@/test/render-with-providers';

import { startCheckout } from '../checkout.slice';
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

  describe('tokenization (2b) and the summary stub', () => {
    function renderAtCard() {
      return renderDialog(true, {
        checkout: { productId: product.id, quantity: 2, isDialogOpen: true, step: 'CARD' },
        customer: { remembered: REMEMBERED },
      });
    }

    // Flushes the zod resolver's own microtask tick inside an `act`
    // boundary, so react-hook-form's late `isValidating` update never lands
    // after the interaction that triggered it already returned.
    async function settle() {
      await act(() => Promise.resolve());
    }

    async function fillAndSubmitCard(user: ReturnType<typeof renderAtCard>['user']) {
      await user.type(screen.getByLabelText('Número de tarjeta'), '4242424242424242');
      await user.type(screen.getByLabelText('Nombre en la tarjeta'), 'Jane Doe');
      await user.type(screen.getByLabelText('MM/AA'), '1229');
      await user.type(screen.getByLabelText('CVC'), '391');
      await user.tab();
      await settle();
      await user.click(await screen.findByRole('checkbox', { name: /términos y condiciones/ }));
      await user.click(screen.getByRole('checkbox', { name: /tratamiento de mis datos personales/ }));
      await settle();
      await user.click(screen.getByRole('button', { name: 'Continuar' }));
    }

    it('tokenizes 4242 and moves to the summary stub showing VISA •••• 4242', async () => {
      const { user } = renderAtCard();

      await fillAndSubmitCard(user);

      expect(await screen.findByText('VISA •••• 4242', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    });

    it('after tokenizing, closing and reopening lands on CARD with an empty card form', async () => {
      const { user, store } = renderAtCard();

      await fillAndSubmitCard(user);
      await screen.findByText('VISA •••• 4242', {}, { timeout: 5000 });

      await user.click(screen.getByRole('button', { name: 'Cerrar' }));
      expect(store.getState().checkout.isDialogOpen).toBe(false);
      expect(store.getState().checkoutSession.card).toBeNull();

      act(() => {
        store.dispatch(startCheckout({ productId: product.id, quantity: 2 }));
      });

      expect(await screen.findByRole('heading', { name: 'Datos de tu tarjeta' })).toBeInTheDocument();
      expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('');
    });
  });
});
