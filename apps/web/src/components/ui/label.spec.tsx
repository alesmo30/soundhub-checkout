import { render, screen } from '@testing-library/react';

import { Input } from './input';
import { Label } from './label';

describe('Label', () => {
  it('associates with its input through htmlFor', () => {
    render(
      <>
        <Label htmlFor="email">Correo</Label>
        <Input id="email" />
      </>,
    );

    expect(screen.getByLabelText('Correo')).toBeInTheDocument();
  });
});
