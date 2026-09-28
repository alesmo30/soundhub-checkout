import { render, screen } from '@testing-library/react';
import { CURRENCY } from '@checkout/shared/constants';
import type { Quote } from '@checkout/shared/contracts';
import { FeeRule } from '@checkout/shared/enums';

import { formatCop } from '@/lib/money';

import { SummaryBreakdown } from './summary-breakdown';

const QUOTE: Quote = {
  product: { id: 'p1', name: 'WH-1000XM5', unitPriceInCents: 189_990_000 },
  quantity: 3,
  subtotalInCents: 569_970_000,
  vatIncludedInCents: 90_995_500,
  baseFeeInCents: 12_066_000,
  delivery: {
    feeInCents: 25_000_00,
    rule: FeeRule.NATIONAL_DISTANCE,
    distanceKm: 512,
    warehouse: { id: 'w1', name: 'Medellín DC' },
  },
  totalInCents: 607_536_000,
  currency: CURRENCY,
};

// getByText's own normalizer collapses a non-breaking space (what formatCop
// emits) to a regular one without normalizing the matcher string the same
// way, so every money assertion here reads the raw rendered text instead.
describe('SummaryBreakdown', () => {
  it('renders every amount from the quote with formatCop, including IVA incluido', () => {
    const { container } = render(<SummaryBreakdown quote={QUOTE} />);

    expect(screen.getByText('WH-1000XM5 × 3')).toBeInTheDocument();
    const vatNote = screen.getByText(/IVA incluido/);
    expect(vatNote.textContent).toContain(formatCop(QUOTE.vatIncludedInCents));

    expect(container.textContent).toContain(formatCop(QUOTE.subtotalInCents));
    expect(screen.getByText('Comisión de la pasarela de pago')).toBeInTheDocument();
    expect(container.textContent).toContain(formatCop(QUOTE.baseFeeInCents));
    expect(container.textContent).toContain(formatCop(QUOTE.delivery.feeInCents));
    expect(container.textContent).toContain(formatCop(QUOTE.totalInCents));
  });

  it('appends the distance for a NATIONAL_DISTANCE fee', () => {
    render(<SummaryBreakdown quote={QUOTE} />);

    expect(screen.getByText('Envío nacional · 512 km')).toBeInTheDocument();
  });

  it('shows the FREE_METRO label without a distance suffix', () => {
    render(
      <SummaryBreakdown
        quote={{
          ...QUOTE,
          delivery: { ...QUOTE.delivery, rule: FeeRule.FREE_METRO, feeInCents: 0 },
        }}
      />,
    );

    expect(screen.getByText('Envío gratis')).toBeInTheDocument();
  });

  it('shows the METRO_FLAT label', () => {
    render(
      <SummaryBreakdown
        quote={{ ...QUOTE, delivery: { ...QUOTE.delivery, rule: FeeRule.METRO_FLAT } }}
      />,
    );

    expect(screen.getByText('Envío área metropolitana')).toBeInTheDocument();
  });
});
