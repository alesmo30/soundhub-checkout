import { render, screen } from '@testing-library/react';

import { TrustFooter } from './trust-footer';

describe('TrustFooter', () => {
  it('shows the "Pago seguro" text', () => {
    render(<TrustFooter />);

    expect(screen.getByText('Pago seguro')).toBeInTheDocument();
  });
});
