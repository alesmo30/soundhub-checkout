import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { makeStore } from './store';
import { routes } from './router';

function renderAt(path: string) {
  const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] });

  return render(
    <Provider store={makeStore()}>
      <RouterProvider router={memoryRouter} />
    </Provider>,
  );
}

describe('router', () => {
  it('renders the catalog on /', async () => {
    renderAt('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Audífonos' })).toBeInTheDocument();
    expect(await screen.findAllByRole('heading', { level: 2 })).toHaveLength(10);
  });

  it('renders the product page on /products/:id', async () => {
    renderAt('/products/abc');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No encontramos este producto' }),
    ).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown transaction id', async () => {
    renderAt('/transactions/abc');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No encontramos este pago' }),
    ).toBeInTheDocument();
  });

  it('renders the 404 page for an unmatched route', () => {
    renderAt('/nope');

    expect(screen.getByText('404 - Página no encontrada')).toBeInTheDocument();
  });
});
