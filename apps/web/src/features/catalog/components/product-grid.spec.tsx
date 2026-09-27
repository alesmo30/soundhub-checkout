import { PAGE_SIZE_DEFAULT } from '@checkout/shared/constants';
import { render, screen } from '@testing-library/react';

import { products } from '@/mocks/fixtures/products';
import { renderWithProviders } from '@/test/render-with-providers';

import { EAGER_IMAGE_COUNT, PRODUCT_GRID_IMAGE_SIZES } from '../catalog.constants';
import { ProductGrid, ProductGridSkeleton } from './product-grid';

describe('ProductGrid', () => {
  it('renders one card per product', () => {
    const page = products.slice(0, 5);

    renderWithProviders(<ProductGrid products={page} />);

    expect(screen.getAllByRole('link')).toHaveLength(page.length);
  });

  it('loads the first row eagerly and the rest lazily, with the grid sizes', () => {
    renderWithProviders(<ProductGrid products={products.slice(0, 5)} />);

    const images = screen.getAllByRole('img');
    const loading = images.map((image) => image.getAttribute('loading'));

    expect(loading.slice(0, EAGER_IMAGE_COUNT)).toEqual(['eager', 'eager', 'eager']);
    expect(loading.slice(EAGER_IMAGE_COUNT)).toEqual(['lazy', 'lazy']);
    expect(images[0]).toHaveAttribute('sizes', PRODUCT_GRID_IMAGE_SIZES);
  });
});

describe('ProductGridSkeleton', () => {
  it('announces the loading state and shows one placeholder card per page slot', () => {
    render(<ProductGridSkeleton />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando productos…');
    expect(screen.getAllByRole('listitem', { hidden: true })).toHaveLength(PAGE_SIZE_DEFAULT);
  });
});
