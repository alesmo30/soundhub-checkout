import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.scrollIntoView = jest.fn();
});

function renderSelect() {
  return render(
    <Select defaultValue="medellin">
      <SelectTrigger aria-label="Municipio">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Antioquia</SelectLabel>
          <SelectItem value="medellin">Medellín</SelectItem>
          <SelectItem value="envigado">Envigado</SelectItem>
        </SelectGroup>
        <SelectSeparator />
      </SelectContent>
    </Select>,
  );
}

describe('Select', () => {
  it('shows the default selected value', () => {
    renderSelect();

    expect(screen.getByRole('combobox', { name: 'Municipio' })).toHaveTextContent('Medellín');
  });

  it('selects a new option on click', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox', { name: 'Municipio' }));
    await user.click(await screen.findByRole('option', { name: 'Envigado' }));

    expect(screen.getByRole('combobox', { name: 'Municipio' })).toHaveTextContent('Envigado');
  });

  it('renders the group label', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox', { name: 'Municipio' }));

    expect(await screen.findByText('Antioquia')).toBeInTheDocument();
  });
});
