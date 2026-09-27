import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { Header } from './header';

describe('Header', () => {
  it('shows the SoundHub wordmark linking to /', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'SoundHub' })).toHaveAttribute('href', '/');
  });
});
