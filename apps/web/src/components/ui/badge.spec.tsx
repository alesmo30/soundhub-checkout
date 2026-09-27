import { render, screen } from '@testing-library/react';

import { Badge } from './badge';

describe('Badge', () => {
  it.each(['success', 'danger', 'neutral'] as const)('renders the %s variant', (variant) => {
    render(<Badge variant={variant}>Label</Badge>);

    expect(screen.getByText('Label')).toBeInTheDocument();
  });
});
