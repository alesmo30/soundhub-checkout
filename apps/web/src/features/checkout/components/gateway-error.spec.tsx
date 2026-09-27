import { render, screen } from '@testing-library/react';

import { GATEWAY_ERROR_MESSAGES } from '../checkout.constants';
import { GatewayError } from './gateway-error';

describe('GatewayError', () => {
  it('renders nothing when there is no reason', () => {
    const { container } = render(<GatewayError reason={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the INVALID_CARD message with role="alert"', () => {
    render(<GatewayError reason="INVALID_CARD" />);

    expect(screen.getByRole('alert')).toHaveTextContent(GATEWAY_ERROR_MESSAGES.INVALID_CARD);
  });

  it('shows the UNAVAILABLE message with role="alert"', () => {
    render(<GatewayError reason="UNAVAILABLE" />);

    expect(screen.getByRole('alert')).toHaveTextContent(GATEWAY_ERROR_MESSAGES.UNAVAILABLE);
  });
});
