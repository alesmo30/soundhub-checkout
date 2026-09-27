import { render, screen } from '@testing-library/react';

import { StockBadge } from './stock-badge';

describe('StockBadge', () => {
  it.each([
    [0, 'Agotado'],
    [1, 'Última unidad'],
    [7, '7 disponibles'],
  ])('shows the stock %i as "%s"', (stockAvailable, text) => {
    render(<StockBadge stockAvailable={stockAvailable} />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
