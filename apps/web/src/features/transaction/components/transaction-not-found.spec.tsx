import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { TransactionNotFound } from './transaction-not-found';

describe('TransactionNotFound', () => {
  it('renders the not-found copy and a link back to the catalog', () => {
    render(
      <MemoryRouter>
        <TransactionNotFound />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'No encontramos este pago' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/');
  });
});
