import { render, screen } from '@testing-library/react';

import { formatCop } from '@/lib/money';
import { transactionApprovedFixture } from '@/mocks/fixtures/transaction';

import { TransactionBreakdown } from './transaction-breakdown';

// getByText's own normalizer collapses a non-breaking space (what formatCop
// emits) to a regular one without normalizing the matcher string the same
// way, so every money assertion here reads the raw rendered text instead
// (see summary-breakdown.spec.tsx).
describe('TransactionBreakdown', () => {
  it('renders every amount from the view with formatCop, and never the raw statusMessage', () => {
    const view = { ...transactionApprovedFixture, statusMessage: 'raw gateway text' };

    const { container } = render(<TransactionBreakdown view={view} />);

    expect(screen.getByText(`${view.product.name} × ${view.quantity}`)).toBeInTheDocument();
    expect(screen.getByText('Comisión de la pasarela de pago')).toBeInTheDocument();
    expect(container.textContent).toContain(formatCop(view.amounts.subtotalInCents));
    expect(container.textContent).toContain(formatCop(view.amounts.baseFeeInCents));
    expect(container.textContent).toContain(formatCop(view.amounts.deliveryFeeInCents));
    expect(container.textContent).toContain(formatCop(view.amounts.totalInCents));
    expect(screen.queryByText('raw gateway text')).not.toBeInTheDocument();
  });
});
