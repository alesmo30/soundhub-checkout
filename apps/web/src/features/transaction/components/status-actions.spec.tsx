import { render } from '@testing-library/react';

import { transactionApprovedFixture } from '@/mocks/fixtures/transaction';

import { StatusActions } from './status-actions';

// Trivial placeholder for now: step 9 fills in "Volver al producto" and
// "Intentar con otra tarjeta" (specs/11-web-payment.md#implementation-plan,
// step 9).
describe('StatusActions', () => {
  it('renders nothing yet', () => {
    const { container } = render(<StatusActions view={transactionApprovedFixture} />);

    expect(container).toBeEmptyDOMElement();
  });
});
