import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { HttpResponse, http } from 'msw';
import type { CreateTransactionRequest } from '@checkout/shared/contracts';
import { CardBrand, ErrorCode } from '@checkout/shared/enums';

import { makeStore, type AppStore } from '@/app/store';
import { server } from '@/mocks/server';
import { transactionProgressingId } from '@/mocks/fixtures/transaction';
import { problem } from '@/mocks/problem';

import { writePendingPayment, readPendingPayment, type PendingPayment } from '../lib/pending-payment';
import { PendingPaymentRecovery } from './pending-payment-recovery';

const IDEMPOTENCY_KEY = '11111111-2222-4333-8444-555555555555';

const BODY: CreateTransactionRequest = {
  customerId: '99999999-9999-4999-8999-999999999999',
  productId: '11111111-1111-4111-8111-111111111101',
  quantity: 1,
  installments: 1,
  expectedTotalInCents: 100_000,
  payment: {
    cardToken: 'tok_test_4242',
    cardBrand: CardBrand.VISA,
    cardLast4: '4242',
    acceptanceToken: 'test-acceptance-token',
    personalAuthToken: 'test-personal-data-token',
  },
  delivery: {
    recipientName: 'Ana Test',
    phone: '3001234567',
    addressLine: 'Cra 43A # 1-50',
    municipalityCode: '05001',
  },
};

function writeEntry(overrides: Partial<PendingPayment> = {}): void {
  writePendingPayment({
    idempotencyKey: IDEMPOTENCY_KEY,
    body: BODY,
    savedAt: new Date().toISOString(),
    ...overrides,
  });
}

function setup(store: AppStore = makeStore()) {
  let router: ReturnType<typeof createMemoryRouter> | undefined;

  const wrapper = ({ children }: { children: ReactNode }) => {
    router ??= createMemoryRouter([{ path: '*', element: <>{children}</> }], {
      initialEntries: ['/products/x'],
    });

    return (
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    );
  };

  const result = render(<PendingPaymentRecovery />, { wrapper });

  return { store, result, getPathname: () => router?.state.location.pathname ?? null };
}

describe('PendingPaymentRecovery', () => {
  it('renders nothing and sends nothing when there is no pending entry', () => {
    expect(readPendingPayment()).toBeNull();

    let requested = false;
    server.use(
      http.post('*/api/v1/transactions', () => {
        requested = true;
        return HttpResponse.json({ data: { id: transactionProgressingId, status: 'PENDING' } }, { status: 201 });
      }),
    );

    const { result } = setup();

    expect(result.container).toBeEmptyDOMElement();
    expect(requested).toBe(false);
  });

  it('shows the overlay and re-sends the stored key and a byte-identical body', async () => {
    writeEntry();

    let receivedKey: string | null = null;
    let receivedBody: CreateTransactionRequest | undefined;
    server.use(
      http.post('*/api/v1/transactions', async ({ request }) => {
        receivedKey = request.headers.get('Idempotency-Key');
        receivedBody = (await request.json()) as CreateTransactionRequest;
        return HttpResponse.json({ data: { id: transactionProgressingId, status: 'PENDING' } }, { status: 201 });
      }),
    );

    const { getPathname } = setup();

    expect(screen.getByText('Recuperando tu pago…')).toBeInTheDocument();

    await waitFor(() => expect(getPathname()).toBe(`/transactions/${transactionProgressingId}`));

    expect(receivedKey).toBe(IDEMPOTENCY_KEY);
    expect(receivedBody).toEqual(BODY);
  });

  it('on 201 navigates and clears the entry', async () => {
    writeEntry();
    server.use(
      http.post('*/api/v1/transactions', () =>
        HttpResponse.json({ data: { id: transactionProgressingId, status: 'PENDING' } }, { status: 201 }),
      ),
    );

    const { getPathname } = setup();

    await waitFor(() => expect(getPathname()).toBe(`/transactions/${transactionProgressingId}`));
    expect(readPendingPayment()).toBeNull();
  });

  it('on a definitive 409 clears the entry and shows the one-time notice', async () => {
    writeEntry();
    server.use(
      http.post('*/api/v1/transactions', () =>
        HttpResponse.json(problem(409, ErrorCode.OUT_OF_STOCK, 'failed'), {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ),
    );

    setup();

    expect(
      await screen.findByText('Tu pago anterior no se completó y no se hizo ningún cobro. Ingresa tu tarjeta de nuevo.'),
    ).toBeInTheDocument();
    expect(readPendingPayment()).toBeNull();
    expect(screen.queryByText('Recuperando tu pago…')).not.toBeInTheDocument();
  });

  it('on a network error shows the uncertain message with Reintentar and keeps the entry', async () => {
    const user = userEvent.setup();
    writeEntry();
    server.use(http.post('*/api/v1/transactions', () => HttpResponse.error()));

    setup();

    expect(await screen.findByText(/No pudimos confirmar tu pago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(readPendingPayment()).not.toBeNull();

    server.use(
      http.post('*/api/v1/transactions', () =>
        HttpResponse.json({ data: { id: transactionProgressingId, status: 'PENDING' } }, { status: 201 }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(readPendingPayment()).toBeNull());
  });
});
