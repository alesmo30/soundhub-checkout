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
  it.each([
    ['/', 'Catálogo (placeholder)'],
    ['/products/abc', 'Producto abc (placeholder)'],
    ['/transactions/abc', 'Transacción abc (placeholder)'],
    ['/nope', '404 - Página no encontrada'],
  ])('renders the placeholder for %s', (path, expectedText) => {
    renderAt(path);

    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});
