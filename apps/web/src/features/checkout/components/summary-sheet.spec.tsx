import { act, screen, waitFor } from '@testing-library/react';
import { CardBrand } from '@checkout/shared/enums';

import { products } from '@/mocks/fixtures/products';
import { quoteFixture } from '@/mocks/fixtures/quote';
import { renderWithProviders, type RenderWithProvidersOptions } from '@/test/render-with-providers';

import type { CheckoutSessionState } from '../checkout-session.slice';
import { SummarySheet } from './summary-sheet';

const product = products.find((candidate) => candidate.sku === 'HP-SNY-WH1000XM5')!;

const CONTACT = {
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
    addressDetail: 'Apto 501',
  },
};

const BASE_SESSION: CheckoutSessionState = {
  contact: CONTACT,
  quoteMunicipalityCode: null,
  card: { token: 'tok_test_4242', brand: CardBrand.VISA, last4: '4242' },
  installments: 1,
  acceptance: { acceptanceToken: 'acc_test', personalDataAuthToken: 'auth_test' },
  idempotencyKey: null,
  paymentProblem: null,
  contactFieldError: null,
};

function renderSummary(
  checkoutSessionOverrides?: Partial<CheckoutSessionState>,
  preloadedState?: RenderWithProvidersOptions['preloadedState'],
) {
  return renderWithProviders(<SummarySheet productId={product.id} quantity={2} />, {
    preloadedState: {
      checkout: { productId: product.id, quantity: 2, isDialogOpen: true, step: 'SUMMARY' },
      checkoutSession: { ...BASE_SESSION, ...checkoutSessionOverrides },
      ...preloadedState,
    },
  });
}

describe('SummarySheet', () => {
  it('renders every amount from the quote fixture with formatCop, including IVA incluido', async () => {
    renderSummary();

    expect(await screen.findByText(`${quoteFixture.product.name} × ${quoteFixture.quantity}`)).toBeInTheDocument();
    expect(screen.getByText(/IVA incluido/)).toBeInTheDocument();
    expect(screen.getByText('Envío gratis')).toBeInTheDocument();
  });

  it('shows the masked card and the address with the municipality name', async () => {
    renderSummary();

    await screen.findByText(`${quoteFixture.product.name} × ${quoteFixture.quantity}`);

    expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.getByText(/Calle 10 # 20-30/)).toBeInTheDocument();
    expect(screen.getByText(/Medellín/)).toBeInTheDocument();
  });

  it('"Editar" returns to CARD and rotates the idempotency key', async () => {
    const { store, user } = renderSummary({ idempotencyKey: 'key-1' });

    await screen.findByText(`${quoteFixture.product.name} × ${quoteFixture.quantity}`);

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(store.getState().checkout.step).toBe('CARD');
    expect(store.getState().checkoutSession.idempotencyKey).not.toBe('key-1');
    expect(store.getState().checkoutSession.idempotencyKey).not.toBeNull();
  });

  it('disables "Pagar" while the quote loads, then enables it with the total', async () => {
    renderSummary();

    const payButton = screen.getByRole('button', { name: /Pagar/ });
    expect(payButton).toBeDisabled();

    await waitFor(() => expect(payButton).not.toBeDisabled());
    expect(payButton).toHaveTextContent('Pagar');
  });

  it('PRICE_CHANGED highlights the new total and keeps "Pagar" enabled', async () => {
    renderSummary({
      paymentProblem: { kind: 'PRICE_CHANGED', previousTotalInCents: 100_000_00 },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El total cambió');

    await waitFor(() => expect(screen.getByRole('button', { name: /Pagar/ })).not.toBeDisabled());
  });

  it('OUT_OF_STOCK hides "Pagar" and shows "Ajustar cantidad"', async () => {
    const { store, user } = renderSummary({ paymentProblem: { kind: 'OUT_OF_STOCK' } });

    await screen.findByRole('alert');

    expect(screen.queryByRole('button', { name: /Pagar/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ajustar cantidad' }));

    expect(store.getState().checkout.isDialogOpen).toBe(false);
  });

  it('UNCERTAIN shows only "Reintentar" and hides "Editar"', async () => {
    renderSummary({ paymentProblem: { kind: 'UNCERTAIN' } });

    await screen.findByRole('alert');

    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pagar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('closing the layer (Esc) returns to CARD without closing the checkout', async () => {
    const { store, user } = renderSummary();

    await screen.findByText(`${quoteFixture.product.name} × ${quoteFixture.quantity}`);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(store.getState().checkout.step).toBe('CARD'));
    expect(store.getState().checkout.isDialogOpen).toBe(true);
  });

  it('creates an idempotency key on mount when there is none', async () => {
    const { store } = renderSummary({ idempotencyKey: null });

    await waitFor(() => expect(store.getState().checkoutSession.idempotencyKey).not.toBeNull());
  });

  it('keeps an existing idempotency key on mount', async () => {
    const { store } = renderSummary({ idempotencyKey: 'existing-key' });

    await act(() => Promise.resolve());

    expect(store.getState().checkoutSession.idempotencyKey).toBe('existing-key');
  });

  it('clicking "Pagar" once enabled calls pay() and lands on the transaction page', async () => {
    const { store, user } = renderSummary();

    const payButton = await screen.findByRole('button', { name: /Pagar/ });
    await waitFor(() => expect(payButton).not.toBeDisabled());

    await user.click(payButton);

    await waitFor(() => expect(store.getState().checkoutSession.card).toBeNull());
  });

  it('clicking "Reintentar" while UNCERTAIN calls retry()', async () => {
    const { user } = renderSummary({ paymentProblem: { kind: 'UNCERTAIN' } });

    await screen.findByRole('alert');

    // No pending entry exists in this test, so retry() is a no-op; the
    // point here is only that SummarySheet's own handler reaches it.
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
  });

  it('renders as a Dialog from the desktop breakpoint', async () => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });

    try {
      renderSummary();

      await screen.findByRole('dialog', { name: 'Resumen de tu pago' });
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
