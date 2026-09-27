import { screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { Paginated, ProductSummary } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import { useLocation } from 'react-router';

import { products } from '@/mocks/fixtures/products';
import { problem } from '@/mocks/problem';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render-with-providers';

import { CatalogPage } from './catalog-page';

const PRODUCTS_URL = '*/api/v1/products';

function LocationProbe() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderCatalogAt(route = '/') {
  return renderWithProviders(
    <>
      <CatalogPage />
      <LocationProbe />
    </>,
    { route },
  );
}

function problemResponse(status: number, code: ErrorCode) {
  return HttpResponse.json(problem(status, code, 'Failed'), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

const cardTitles = () => screen.findAllByRole('heading', { level: 2 });

describe('CatalogPage', () => {
  let scrollTo: jest.SpyInstance;

  beforeEach(() => {
    scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the skeleton while loading, then the 10 cards of page 1', async () => {
    renderCatalogAt();

    expect(screen.getByRole('status')).toHaveTextContent('Cargando productos…');
    expect(await cardTitles()).toHaveLength(10);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows "Agotado" on the out-of-stock product', async () => {
    renderCatalogAt();

    const outOfStock = products.find(({ stockAvailable }) => stockAvailable === 0)!;
    const card = (await screen.findByRole('heading', { name: outOfStock.name })).closest('a')!;

    expect(within(card).getByText('Agotado')).toBeInTheDocument();
  });

  it('goes to page 2 through the URL and shows its products', async () => {
    const { user } = renderCatalogAt();
    await cardTitles();

    await user.click(screen.getByRole('link', { name: '2' }));

    expect(screen.getByTestId('search')).toHaveTextContent('?page=2');
    expect(await screen.findByRole('heading', { name: products[10]!.name })).toBeInTheDocument();
    expect(await cardTitles()).toHaveLength(2);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('marks the page from the URL as current', async () => {
    renderCatalogAt('/?page=2');
    await cardTitles();

    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '1' })).not.toHaveAttribute('aria-current');
  });

  it('treats ?page=abc as page 1', async () => {
    renderCatalogAt('/?page=abc');

    expect(await screen.findByRole('heading', { name: products[0]!.name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the error message and recovers with "Reintentar"', async () => {
    server.use(
      http.get(PRODUCTS_URL, () => problemResponse(500, ErrorCode.INTERNAL_ERROR), { once: true }),
    );
    const { user } = renderCatalogAt();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.',
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await cardTitles()).toHaveLength(10);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks the customer to wait when rate limited', async () => {
    server.use(http.get(PRODUCTS_URL, () => problemResponse(429, ErrorCode.RATE_LIMITED)));
    renderCatalogAt();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hiciste muchas solicitudes seguidas. Espera un momento e inténtalo de nuevo.',
    );
  });

  it('tells the customer when the catalog is empty', async () => {
    const empty: Paginated<ProductSummary> = {
      data: [],
      meta: { page: 1, limit: 10, totalItems: 0, totalPages: 0 },
    };
    server.use(http.get(PRODUCTS_URL, () => HttpResponse.json(empty)));
    renderCatalogAt();

    expect(await screen.findByText('Aún no hay productos disponibles.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('offers a link back to page 1 for a page past the end', async () => {
    renderCatalogAt('/?page=5');

    expect(await screen.findByText('Esta página no tiene productos.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la página 1' })).toHaveAttribute('href', '/');
  });
});
