import { act, cleanup, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ApiResponse, ProductDetail } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import { Route, Routes } from 'react-router';

import type { CheckoutState } from '@/features/checkout';
import { products } from '@/mocks/fixtures/products';
import { problem } from '@/mocks/problem';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render-with-providers';

import { invalidateProduct } from '../catalog.api';
import { ProductPage } from './product-page';

const PRODUCT_URL = '*/api/v1/products/:id';
const UNKNOWN_ID = '11111111-1111-4111-8111-999999999999';

function productBySku(sku: string): ProductDetail {
  return products.find((candidate) => candidate.sku === sku)!;
}

const inStock = productBySku('HP-SNY-WH1000XM5'); // stock 7
const lowStock = productBySku('HP-BOS-QCULTRA'); // stock 3
const lastUnit = productBySku('HP-APL-AIRPODSMAX'); // stock 1
const outOfStock = productBySku('HP-BOS-QCEARBUDS2'); // stock 0

function renderProductPage(id: string, checkout?: CheckoutState) {
  return renderWithProviders(
    <Routes>
      <Route path="/products/:id" element={<ProductPage />} />
    </Routes>,
    { route: `/products/${id}`, preloadedState: checkout ? { checkout } : undefined },
  );
}

function problemResponse(status: number, code: ErrorCode) {
  return HttpResponse.json(problem(status, code, 'Failed'), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

const findTitle = (name: string) => screen.findByRole('heading', { level: 1, name });
const quantityShown = () =>
  within(screen.getByRole('group', { name: 'Cantidad' })).getByText(/\d+/);
const increase = () => screen.getByRole('button', { name: 'Aumentar cantidad' });
const decrease = () => screen.getByRole('button', { name: 'Disminuir cantidad' });
const payButton = () => screen.getByRole('button', { name: 'Pagar con tarjeta de crédito' });

describe('ProductPage', () => {
  it('shows the skeleton while loading, then the product details', async () => {
    renderProductPage(inStock.id);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando producto…');
    expect(await findTitle(inStock.name)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(inStock.brand)).toBeInTheDocument();
    expect(screen.getByText(inStock.description)).toBeInTheDocument();
    // formatCop's non-breaking space is normalized to a plain space by Testing Library.
    expect(screen.getByText('$ 1.899.900')).toBeInTheDocument();
    expect(screen.getByText('IVA incluido: $ 360.981')).toBeInTheDocument();
    expect(screen.getByText('7 unidades disponibles')).toBeInTheDocument();
  });

  it('loads the image eagerly with high priority', async () => {
    renderProductPage(inStock.id);
    await findTitle(inStock.name);

    const image = screen.getByRole('img', { name: `${inStock.brand} ${inStock.name}` });
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
  });

  it('uses the singular for the last unit', async () => {
    renderProductPage(lastUnit.id);

    expect(await screen.findByText('1 unidad disponible')).toBeInTheDocument();
  });

  it('bounds the stepper by maxPurchaseQuantity and saves each change', async () => {
    const { store, user } = renderProductPage(lowStock.id);
    await findTitle(lowStock.name);

    expect(decrease()).toBeDisabled();
    await user.click(increase());
    await user.click(increase());

    expect(quantityShown()).toHaveTextContent('3');
    expect(increase()).toBeDisabled();
    expect(store.getState().checkout).toMatchObject({ productId: lowStock.id, quantity: 3 });
  });

  it('disables the stepper and the CTA when the product is out of stock', async () => {
    renderProductPage(outOfStock.id);
    await findTitle(outOfStock.name);

    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expect(increase()).toBeDisabled();
    expect(decrease()).toBeDisabled();
    expect(payButton()).toBeDisabled();
  });

  it('starts the checkout with the chosen quantity and opens the dialog', async () => {
    const { store, user } = renderProductPage(inStock.id);
    await findTitle(inStock.name);

    await user.click(increase());
    await user.click(payButton());

    expect(store.getState().checkout).toEqual({
      productId: inStock.id,
      quantity: 2,
      isDialogOpen: true,
      step: 'CONTACT',
    });
    expect(screen.getByRole('dialog', { name: 'Pago con tarjeta' })).toBeInTheDocument();
  });

  it('restores the quantity saved for this product and reopens the dialog', async () => {
    renderProductPage(inStock.id, {
      productId: inStock.id,
      quantity: 4,
      isDialogOpen: true,
      step: 'CONTACT',
    });

    expect(await screen.findByRole('dialog', { name: 'Pago con tarjeta' })).toBeInTheDocument();
    expect(quantityShown()).toHaveTextContent('4');
  });

  it('only reopens the dialog on the product it was opened for', async () => {
    const openOnInStock = {
      productId: inStock.id,
      quantity: 2,
      isDialogOpen: true,
      step: 'CONTACT' as const,
    };
    renderProductPage(lowStock.id, openOnInStock);
    await findTitle(lowStock.name);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    cleanup();
    renderProductPage(inStock.id, openOnInStock);

    expect(await screen.findByRole('dialog', { name: 'Pago con tarjeta' })).toBeInTheDocument();
  });

  it('starts at 1 when the saved quantity belongs to another product', async () => {
    renderProductPage(inStock.id, {
      productId: lowStock.id,
      quantity: 3,
      isDialogOpen: false,
      step: 'CONTACT',
    });
    await findTitle(inStock.name);

    expect(quantityShown()).toHaveTextContent('1');
  });

  it('clamps a saved quantity above the current maximum', async () => {
    const { store, user } = renderProductPage(lowStock.id, {
      productId: lowStock.id,
      quantity: 9,
      isDialogOpen: false,
      step: 'CONTACT',
    });
    await findTitle(lowStock.name);

    expect(quantityShown()).toHaveTextContent('3');

    await user.click(payButton());

    expect(store.getState().checkout.quantity).toBe(3);
  });

  it.each([
    { label: 'an unknown id', id: UNKNOWN_ID, status: 404, code: ErrorCode.PRODUCT_NOT_FOUND },
    { label: 'a malformed id', id: 'abc', status: 400, code: ErrorCode.VALIDATION_ERROR },
  ])('shows the not-found state for $label', async ({ id, status, code }) => {
    server.use(http.get(PRODUCT_URL, () => problemResponse(status, code)));
    renderProductPage(id);

    expect(await findTitle('No encontramos este producto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/');
  });

  it('shows the error message and recovers with "Reintentar"', async () => {
    server.use(
      http.get(PRODUCT_URL, () => problemResponse(500, ErrorCode.INTERNAL_ERROR), { once: true }),
    );
    const { user } = renderProductPage(inStock.id);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los productos.');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await findTitle(inStock.name)).toBeInTheDocument();
  });

  it('re-fetches the stock when the product is invalidated', async () => {
    const { store } = renderProductPage(inStock.id);
    await findTitle(inStock.name);
    const afterPurchase: ApiResponse<ProductDetail> = {
      data: { ...inStock, stockAvailable: 5, maxPurchaseQuantity: 5 },
    };
    server.use(http.get(PRODUCT_URL, () => HttpResponse.json(afterPurchase)));

    act(() => {
      store.dispatch(invalidateProduct(inStock.id));
    });

    expect(await screen.findByText('5 unidades disponibles')).toBeInTheDocument();
  });
});
