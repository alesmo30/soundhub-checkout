import { screen } from '@testing-library/react';

import { products } from '@/mocks/fixtures/products';
import { renderWithProviders } from '@/test/render-with-providers';

import { OrderPanel } from './order-panel';

const product = products.find((candidate) => candidate.sku === 'HP-SNY-WH1000XM5')!;

describe('OrderPanel', () => {
  it('shows a loading placeholder before the product resolves', () => {
    renderWithProviders(<OrderPanel productId={product.id} quantity={2} />);

    expect(screen.getByTestId('order-panel-mobile')).toHaveTextContent('Cargando…');
  });

  it('shows the product name and quantity on both panels once loaded', async () => {
    renderWithProviders(<OrderPanel productId={product.id} quantity={2} />);

    expect(await screen.findByText(product.name, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByTestId('order-panel-desktop')).toHaveTextContent('× 2');
    expect(screen.getByTestId('order-panel-mobile')).toHaveTextContent(`${product.name} × 2`);
  });

  it('marks the desktop panel hidden below md and the mobile summary hidden from md', async () => {
    renderWithProviders(<OrderPanel productId={product.id} quantity={2} />);
    await screen.findByText(product.name, { selector: 'p' });

    expect(screen.getByTestId('order-panel-desktop')).toHaveClass('hidden', 'md:flex');
    expect(screen.getByTestId('order-panel-mobile')).toHaveClass('flex', 'md:hidden');
  });
});
