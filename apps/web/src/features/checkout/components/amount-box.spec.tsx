import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { ErrorCode } from '@checkout/shared/enums';

import { products } from '@/mocks/fixtures/products';
import { quoteFixture } from '@/mocks/fixtures/quote';
import { problem } from '@/mocks/problem';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render-with-providers';

import { AmountBox } from './amount-box';

const QUOTE_URL = '*/api/v1/quotes';
const product = products.find((candidate) => candidate.sku === 'HP-SNY-WH1000XM5')!;

function renderAmountBox(municipalityCode: string | null) {
  return renderWithProviders(
    <AmountBox productId={product.id} quantity={quoteFixture.quantity} />,
    {
      preloadedState: {
        checkoutSession: {
          contact: null,
          quoteMunicipalityCode: municipalityCode,
          card: null,
          installments: 1,
          acceptance: null,
          idempotencyKey: null,
          paymentProblem: null,
          contactFieldError: null,
        },
      },
    },
  );
}

function problemResponse(status: number, code: ErrorCode) {
  return HttpResponse.json(problem(status, code, 'Failed'), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

describe('AmountBox', () => {
  it('asks for a municipality before fetching a quote', () => {
    renderAmountBox(null);

    expect(screen.getByText('Selecciona tu municipio para calcular el total')).toBeInTheDocument();
  });

  it('shows a skeleton and "Calculando total…" while the quote loads', () => {
    renderAmountBox('05001');

    expect(screen.getByText('Calculando total…')).toBeInTheDocument();
  });

  it('shows the server-computed total once the quote resolves', async () => {
    renderAmountBox('05001');

    expect(await screen.findByText('$ 3.920.460')).toBeInTheDocument();
  });

  it('shows the out-of-stock message with a link back to the product', async () => {
    server.use(http.get(QUOTE_URL, () => problemResponse(409, ErrorCode.OUT_OF_STOCK)));
    renderAmountBox('05001');

    expect(
      await screen.findByText(
        `Solo quedan ${product.stockAvailable} unidades. Vuelve al producto para ajustar la cantidad.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver producto' })).toHaveAttribute(
      'href',
      `/products/${product.id}`,
    );
  });

  it('shows a generic error and recovers with "Reintentar"', async () => {
    server.use(
      http.get(QUOTE_URL, () => problemResponse(500, ErrorCode.INTERNAL_ERROR), { once: true }),
    );
    const { user } = renderAmountBox('05001');

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos calcular el total.');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('$ 3.920.460')).toBeInTheDocument();
  });
});
