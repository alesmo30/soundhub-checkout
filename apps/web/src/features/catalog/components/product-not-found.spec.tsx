import { screen } from '@testing-library/react';

import { renderWithProviders } from '@/test/render-with-providers';

import { ProductNotFound } from './product-not-found';

describe('ProductNotFound', () => {
  it('explains the product does not exist and links back to the catalog', () => {
    renderWithProviders(<ProductNotFound />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'No encontramos este producto' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/');
  });
});
