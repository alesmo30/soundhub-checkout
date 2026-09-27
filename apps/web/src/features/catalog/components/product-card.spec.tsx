import type { ProductSummary } from '@checkout/shared/contracts';
import { screen } from '@testing-library/react';

import { renderWithProviders } from '@/test/render-with-providers';

import { ProductCard } from './product-card';

const product: ProductSummary = {
  id: '11111111-1111-4111-8111-111111111108',
  sku: 'HP-ATH-M50X',
  name: 'ATH-M50x',
  brand: 'Audio-Technica',
  priceInCents: 99_900_000,
  currency: 'COP',
  imageUrl: '/images/products/HP-ATH-M50X-640.webp',
  stockAvailable: 0,
};

describe('ProductCard', () => {
  it('links to the product page', () => {
    renderWithProviders(<ProductCard product={product} eagerImage={false} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', `/products/${product.id}`);
  });

  it('shows the image, brand, name, formatted price and stock', () => {
    renderWithProviders(<ProductCard product={product} eagerImage={false} />);

    expect(screen.getByRole('img', { name: 'Audio-Technica ATH-M50x' })).toBeInTheDocument();
    expect(screen.getByText('Audio-Technica')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ATH-M50x' })).toBeInTheDocument();
    // formatCop's non-breaking space is normalized to a plain space by Testing Library.
    expect(screen.getByText('$ 999.000')).toBeInTheDocument();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
  });
});
