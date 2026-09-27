import { render } from '@testing-library/react';

import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a pulsing placeholder element', () => {
    const { container } = render(<Skeleton data-testid="skeleton" />);

    expect(container.firstChild).toHaveClass('animate-pulse');
  });
});
