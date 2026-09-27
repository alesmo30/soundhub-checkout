import { render, screen } from '@testing-library/react';

import { TestModeBanner } from './test-mode-banner';

describe('TestModeBanner', () => {
  it('shows the MODO DE PRUEBAS badge', () => {
    render(<TestModeBanner />);

    expect(screen.getByText('MODO DE PRUEBAS')).toBeInTheDocument();
  });
});
