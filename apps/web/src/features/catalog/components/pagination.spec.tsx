import { screen } from '@testing-library/react';

import { renderWithProviders } from '@/test/render-with-providers';

import { Pagination } from './pagination';

describe('Pagination', () => {
  let scrollTo: jest.SpyInstance;

  beforeEach(() => {
    scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([0, 1])('renders nothing when there are %i pages', (totalPages) => {
    renderWithProviders(<Pagination page={1} totalPages={totalPages} />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('links every page number and marks the current one', () => {
    renderWithProviders(<Pagination page={2} totalPages={3} />);

    const nav = screen.getByRole('navigation', { name: 'Paginación' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '3' })).toHaveAttribute('href', '/?page=3');
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '1' })).not.toHaveAttribute('aria-current');
  });

  it('links "Anterior" and "Siguiente" to the neighbouring pages', () => {
    renderWithProviders(<Pagination page={2} totalPages={3} />);

    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Siguiente' })).toHaveAttribute('href', '/?page=3');
  });

  it('disables "Anterior" on the first page and "Siguiente" on the last', () => {
    const { unmount } = renderWithProviders(<Pagination page={1} totalPages={2} />);

    expect(screen.queryByRole('link', { name: 'Anterior' })).not.toBeInTheDocument();
    expect(screen.getByText('Anterior')).toHaveAttribute('aria-disabled', 'true');
    unmount();

    renderWithProviders(<Pagination page={2} totalPages={2} />);

    expect(screen.queryByRole('link', { name: 'Siguiente' })).not.toBeInTheDocument();
    expect(screen.getByText('Siguiente')).toHaveAttribute('aria-disabled', 'true');
  });

  it('scrolls to the top when a page is chosen', async () => {
    const { user } = renderWithProviders(<Pagination page={1} totalPages={2} />);

    await user.click(screen.getByRole('link', { name: '2' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});
