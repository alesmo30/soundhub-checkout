import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DesignShowcaseSampleForm } from './design-showcase-sample-form';

describe('DesignShowcaseSampleForm', () => {
  it('shows the Spanish customerSchema messages for every field on empty submit', async () => {
    const user = userEvent.setup();
    render(<DesignShowcaseSampleForm />);

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(
      await screen.findByText('Ingresa tu cédula (6 a 10 dígitos, sin puntos)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu nombre completo')).toBeInTheDocument();
    expect(screen.getByText('Ingresa un correo válido')).toBeInTheDocument();
    expect(
      screen.getByText('Ingresa un celular válido (10 dígitos, empieza por 3)'),
    ).toBeInTheDocument();
  });

  it('links each error message to its input with aria-describedby', async () => {
    const user = userEvent.setup();
    render(<DesignShowcaseSampleForm />);

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const message = await screen.findByText('Ingresa un correo válido');
    const input = screen.getByLabelText('Correo');

    expect(input.getAttribute('aria-describedby')).toContain(message.id);
  });
});
