import { render, screen } from '@testing-library/react';
import { TransactionStatus } from '@checkout/shared/enums';

import { STATUS_COPY } from '../transaction.constants';
import { StatusHero } from './status-hero';

describe('StatusHero', () => {
  it.each(Object.values(TransactionStatus))('renders %s\'s title and reference', (status) => {
    render(<StatusHero status={status} reference="TX-20260926-ABC123" />);

    expect(
      screen.getByRole('heading', { level: 1, name: STATUS_COPY[status].title }),
    ).toBeInTheDocument();
    expect(screen.getByText('TX-20260926-ABC123')).toBeInTheDocument();
  });

  it('renders a spinner for PENDING', () => {
    const { container } = render(
      <StatusHero status={TransactionStatus.PENDING} reference="TX-1" />,
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders a static icon for a final status', () => {
    const { container } = render(
      <StatusHero status={TransactionStatus.APPROVED} reference="TX-1" />,
    );

    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
  });
});
