import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('renders the banner, header link, page content and footer', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>Contenido de la página</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('MODO DE PRUEBAS')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SoundHub' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Contenido de la página')).toBeInTheDocument();
    expect(screen.getByText('Pago seguro')).toBeInTheDocument();
  });
});
