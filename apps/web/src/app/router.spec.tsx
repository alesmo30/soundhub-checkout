import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { routes } from './router';

function renderAt(path: string) {
  const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] });

  return render(<RouterProvider router={memoryRouter} />);
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
