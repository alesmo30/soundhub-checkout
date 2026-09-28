import { act, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';

import { makeStore } from '@/app/store';
import { transactionApprovedFixture } from '@/mocks/fixtures/transaction';

import { TransactionStatusPage } from './transaction-status-page';

function renderAt(id: string) {
  const store = makeStore();

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/transactions/${id}`]}>
        <Routes>
          <Route path="/transactions/:id" element={<TransactionStatusPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

// Real MSW round trips resolve through real promise chains, not fake
// timers; advanceTimersByTimeAsync flushes those microtasks between each
// fake-timer tick (mirrors transaction-status-page.spec.tsx).
async function tick(ms: number): Promise<void> {
  await act(() => jest.advanceTimersByTimeAsync(ms));
}

describe('TransactionStatusPage accessibility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('has no axe violations for an approved transaction', async () => {
    const { container } = renderAt(transactionApprovedFixture.id);

    await tick(50);
    await screen.findByRole('heading', { level: 1, name: '¡Pago aprobado!' });

    // axe-core schedules its own async work with real timers internally, so
    // fake timers (needed above to flush the polling hook) must be turned
    // off before calling it, or the call never settles.
    jest.useRealTimers();

    expect(await axe(container)).toHaveNoViolations();
  });
});
