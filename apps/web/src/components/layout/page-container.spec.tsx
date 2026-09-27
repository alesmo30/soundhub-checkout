import { render, screen } from '@testing-library/react';

import { PageContainer } from './page-container';

describe('PageContainer', () => {
  it('renders its children', () => {
    render(
      <PageContainer>
        <p>Contenido</p>
      </PageContainer>,
    );

    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });
});
