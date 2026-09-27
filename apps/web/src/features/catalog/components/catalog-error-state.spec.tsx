import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CatalogErrorState } from './catalog-error-state';

describe('CatalogErrorState', () => {
  it('announces the message chosen by the error code', () => {
    render(
      <CatalogErrorState
        error={{ status: 429, data: { code: 'RATE_LIMITED' } }}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Hiciste muchas solicitudes seguidas.');
  });

  it('calls onRetry when "Reintentar" is pressed', async () => {
    const onRetry = jest.fn();
    render(<CatalogErrorState error={null} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
