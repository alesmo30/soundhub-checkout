import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('toggles between checked and unchecked', async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Acepto" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Acepto' });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });
});
