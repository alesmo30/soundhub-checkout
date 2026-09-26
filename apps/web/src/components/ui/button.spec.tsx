import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './button';

describe('Button', () => {
  it.each(['primary', 'secondary', 'ghost', 'link'] as const)('renders the %s variant', (variant) => {
    render(<Button variant={variant}>Click me</Button>);

    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it.each(['default', 'compact', 'icon'] as const)('renders the %s size', (size) => {
    render(
      <Button size={size} aria-label="Sized button">
        X
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Sized button' })).toBeInTheDocument();
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Disabled' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
