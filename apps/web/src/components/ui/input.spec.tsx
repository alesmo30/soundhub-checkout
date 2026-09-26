import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Input } from './input';

describe('Input', () => {
  it('renders and accepts typed text', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Nombre" />);

    const input = screen.getByRole('textbox', { name: 'Nombre' });
    await user.type(input, 'Ana');

    expect(input).toHaveValue('Ana');
  });

  it('does not accept input when disabled', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Nombre" disabled />);

    const input = screen.getByRole('textbox', { name: 'Nombre' });
    await user.type(input, 'Ana');

    expect(input).toHaveValue('');
  });
});
