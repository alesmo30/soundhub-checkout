import { render, screen } from '@testing-library/react';
import { detectCardBrand } from '@checkout/shared/validation';

import { CardBrandIcon } from './card-brand-icon';

// Mirrors the exact BIN ranges detectCardBrand implements (see
// packages/shared/src/validation/card-brand.ts), so this only checks the
// icon renders what the shared detector says, never a hardcoded assumption.
describe('CardBrandIcon', () => {
  it.each([
    ['4', 'VISA'],
    ['51', 'Mastercard'],
    ['55', 'Mastercard'],
    ['2221', 'Mastercard'],
    ['2720', 'Mastercard'],
  ])('shows %s as %s', (prefix, label) => {
    const { container } = render(<CardBrandIcon brand={detectCardBrand(prefix)} />);

    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it.each([['56'], ['2721']])('shows nothing for %s', (prefix) => {
    const { container } = render(<CardBrandIcon brand={detectCardBrand(prefix)} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing while the brand is undetected', () => {
    const { container } = render(<CardBrandIcon brand={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
