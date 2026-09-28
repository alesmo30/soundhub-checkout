import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { renderWithProviders } from '@/test/render-with-providers';

import { CatalogPage } from './catalog-page';

describe('CatalogPage accessibility', () => {
  it('has no axe violations once the products load', async () => {
    const { container } = renderWithProviders(<CatalogPage />);

    await screen.findAllByRole('heading', { level: 2 });

    expect(await axe(container)).toHaveNoViolations();
  });
});
