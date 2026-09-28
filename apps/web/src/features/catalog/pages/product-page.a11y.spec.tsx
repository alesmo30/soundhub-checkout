import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Route, Routes } from 'react-router';

import { products } from '@/mocks/fixtures/products';
import { renderWithProviders } from '@/test/render-with-providers';

import { ProductPage } from './product-page';

const inStock = products.find((candidate) => candidate.sku === 'HP-SNY-WH1000XM5')!; // stock 7

function renderProductPage(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/products/:id" element={<ProductPage />} />
    </Routes>,
    { route: `/products/${id}` },
  );
}

describe('ProductPage accessibility', () => {
  it('has no axe violations with the checkout dialog open', async () => {
    const { user } = renderProductPage(inStock.id);

    await screen.findByRole('heading', { level: 1, name: inStock.name });
    await user.click(screen.getByRole('button', { name: 'Pagar con tarjeta de crédito' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pago con tarjeta' });

    // The dialog renders through a Radix Portal into document.body, outside
    // the render container, so axe scans it directly rather than the
    // container. Scanning document.body would also flag the isolated page
    // content behind the dialog for the "region" landmark rule, which is a
    // false positive here: this test renders ProductPage on its own,
    // without the AppShell's <main> landmark that wraps it in the real app.
    expect(await axe(dialog)).toHaveNoViolations();
  });
});
