import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { HttpResponse, http } from 'msw';

import { makeStore } from '@/app/store';
import { server } from '@/mocks/server';
import {
  transactionApprovedFixture,
  transactionDeclinedFixture,
  transactionErrorFixture,
  transactionExpiredFixture,
  transactionPendingFixture,
  transactionVoidedFixture,
} from '@/mocks/fixtures/transaction';

import { POLL_TIMEOUT_MS } from '../transaction.constants';
import { TransactionStatusPage } from './transaction-status-page';

const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

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
// fake-timer tick (mirrors use-transaction-polling.spec.tsx).
async function tick(ms: number): Promise<void> {
  await act(() => jest.advanceTimersByTimeAsync(ms));
}

describe('TransactionStatusPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    [transactionApprovedFixture, '¡Pago aprobado!'],
    [transactionDeclinedFixture, 'Tu pago fue rechazado'],
    [transactionErrorFixture, 'No pudimos procesar tu pago'],
    [transactionVoidedFixture, 'El pago fue anulado'],
    [transactionExpiredFixture, 'El pago expiró'],
  ])(
    'renders $status title, reference, breakdown, masked card and delivery label',
    async (fixture, title) => {
      renderAt(fixture.id);

      await tick(50);

      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText(fixture.reference)).toBeInTheDocument();
      expect(screen.getByText(`${fixture.product.name} × ${fixture.quantity}`)).toBeInTheDocument();
      expect(
        screen.getByText(`${fixture.card.brand} •••• ${fixture.card.last4}`),
      ).toBeInTheDocument();
      expect(screen.getByText('Listo para envío')).toBeInTheDocument();
    },
  );

  it('wraps the status region in aria-live="polite"', async () => {
    renderAt(transactionApprovedFixture.id);

    await tick(50);
    await screen.findByRole('heading', { level: 1, name: '¡Pago aprobado!' });

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the under-review copy and "Actualizar" after the polling window elapses', async () => {
    renderAt(transactionPendingFixture.id);

    await tick(50);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Procesando tu pago…' }),
    ).toBeInTheDocument();

    await tick(POLL_TIMEOUT_MS);

    expect(screen.getByText('Pago en verificación. Te avisaremos por correo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
  });

  it('renders "No encontramos este pago" for an unknown id', async () => {
    server.use(
      http.get(`*/api/v1/transactions/${UNKNOWN_ID}`, () =>
        HttpResponse.json(
          { code: 'TRANSACTION_NOT_FOUND', title: 'Transaction not found' },
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );

    renderAt(UNKNOWN_ID);

    await tick(50);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No encontramos este pago' }),
    ).toBeInTheDocument();
  });
});
