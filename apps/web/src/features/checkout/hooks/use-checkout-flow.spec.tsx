import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { HttpResponse, http } from 'msw';
import type { CreateTransactionRequest } from '@checkout/shared/contracts';
import { CardBrand, ErrorCode } from '@checkout/shared/enums';

import { makeStore, type AppStore } from '@/app/store';
import { server } from '@/mocks/server';
import { customerFixture } from '@/mocks/fixtures/customer';
import { products } from '@/mocks/fixtures/products';
import { quoteFixture } from '@/mocks/fixtures/quote';
import { transactionProgressingId } from '@/mocks/fixtures/transaction';
import { problem } from '@/mocks/problem';
// Cross-feature import allowed in tests (see apps/web/eslint.config.js, W2
// excludes *.spec.{ts,tsx}): needed to assert invalidateProduct's real
// effect (a re-fetch), not just that some action was dispatched.
import { catalogApi } from '@/features/catalog/catalog.api';

import { checkoutApi } from '../checkout.api';
import {
  ensureIdempotencyKey,
  saveCard,
  saveContact,
  selectIdempotencyKey,
  selectPaymentProblem,
  selectContactFieldError,
} from '../checkout-session.slice';
import { selectCheckoutStep, startCheckout } from '../checkout.slice';
import type { ContactDetails } from '../lib/contact-details';
import { readPendingPayment } from '../lib/pending-payment';
import { useCheckoutFlow } from './use-checkout-flow';

const PRODUCT_ID = quoteFixture.product.id;

const CONTACT: ContactDetails = {
  customer: {
    documentNumber: customerFixture.documentNumber,
    fullName: customerFixture.fullName,
    email: customerFixture.email,
    phone: customerFixture.phone,
  },
  address: {
    departmentCode: '05',
    municipalityCode: '05001',
    addressLine: 'Cra 43A # 1-50',
  },
};

const CARD = { token: 'tok_test_4242', brand: CardBrand.VISA, last4: '4242' };
const ACCEPTANCE = {
  acceptanceToken: 'test-acceptance-token',
  personalDataAuthToken: 'test-personal-data-token',
};

function primeStore(store: AppStore) {
  store.dispatch(startCheckout({ productId: PRODUCT_ID, quantity: quoteFixture.quantity }));
  store.dispatch(saveContact(CONTACT));
  store.dispatch(saveCard({ card: CARD, installments: 1, acceptance: ACCEPTANCE }));
  // Mirrors the real flow: the key already exists by the time "Pagar" is
  // clicked, created when the summary opened (specs/11-web-payment.md#scope).
  store.dispatch(ensureIdempotencyKey());
}

function setup(store: AppStore = makeStore()) {
  primeStore(store);

  // Built once, on the wrapper's first render, and reused: `useNavigate`
  // needs a live router in context, and reading `router.state.location`
  // afterwards is enough to assert where it navigated.
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

  const { result } = renderHook(() => useCheckoutFlow(), { wrapper });

  return {
    store,
    result,
    getPathname: () => router?.state.location.pathname ?? null,
  };
}

function transactionsHandler(status: number, code?: ErrorCode) {
  return http.post('*/api/v1/transactions', () => {
    if (code) {
      return HttpResponse.json(problem(status, code, 'failed'), {
        status,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }

    return HttpResponse.json(
      { data: { id: transactionProgressingId, status: 'PENDING' } },
      { status },
    );
  });
}

function customersHandler(status: number, code: ErrorCode) {
  return http.post('*/api/v1/customers', () =>
    HttpResponse.json(problem(status, code, 'failed'), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    }),
  );
}

describe('useCheckoutFlow', () => {
  it('calls upsertCustomer, writes the pending entry, then createTransaction, in that order', async () => {
    const calls: string[] = [];
    server.use(
      http.post('*/api/v1/customers', async ({ request }) => {
        calls.push('customer');
        const body = await request.json();
        return HttpResponse.json({ data: { id: customerFixture.id, ...(body as object) } }, { status: 201 });
      }),
      http.post('*/api/v1/transactions', () => {
        calls.push('transaction');
        expect(readPendingPayment()).not.toBeNull();
        return HttpResponse.json(
          { data: { id: transactionProgressingId, status: 'PENDING' } },
          { status: 201 },
        );
      }),
    );

    const { store, result, getPathname } = setup();

    await act(() => result.current.pay(quoteFixture));

    expect(calls).toEqual(['customer', 'transaction']);
    expect(readPendingPayment()).toBeNull();
    expect(store.getState().checkoutSession.card).toBeNull();
    expect(getPathname()).toBe(`/transactions/${transactionProgressingId}`);
  });

  it('on 201 clears the pending entry, closes checkout and navigates, including a replay', async () => {
    server.use(
      http.post('*/api/v1/transactions', () =>
        HttpResponse.json(
          { data: { id: transactionProgressingId, status: 'ERROR' } },
          { status: 201, headers: { 'Idempotent-Replayed': 'true' } },
        ),
      ),
    );

    const { store, result, getPathname } = setup();

    await act(() => result.current.pay(quoteFixture));

    expect(readPendingPayment()).toBeNull();
    expect(store.getState().checkoutSession.idempotencyKey).toBeNull();
    expect(getPathname()).toBe(`/transactions/${transactionProgressingId}`);
  });

  it('PRICE_CHANGED re-quotes an active subscription, keeps previousTotalInCents and rotates the key', async () => {
    server.use(transactionsHandler(409, ErrorCode.PRICE_CHANGED));

    let quoteRequests = 0;
    server.use(
      http.get('*/api/v1/quotes', () => {
        quoteRequests += 1;
        return HttpResponse.json({ data: quoteFixture });
      }),
    );

    const { store, result } = setup();
    const keyBefore = selectIdempotencyKey(store.getState());

    const subscription = store.dispatch(
      checkoutApi.endpoints.getQuote.initiate({
        productId: PRODUCT_ID,
        quantity: quoteFixture.quantity,
        municipalityCode: '05001',
      }),
    );
    await subscription;
    expect(quoteRequests).toBe(1);

    await act(() => result.current.pay(quoteFixture));

    expect(selectPaymentProblem(store.getState())).toEqual({
      kind: 'PRICE_CHANGED',
      previousTotalInCents: quoteFixture.totalInCents,
    });
    expect(selectIdempotencyKey(store.getState())).not.toBe(keyBefore);
    expect(readPendingPayment()).toBeNull();

    // Proves the hook actually invalidated the Quote tag: the still-active
    // subscription only re-fetches on its own when the tag went stale, not
    // because the test asked it to.
    await waitFor(() => expect(quoteRequests).toBe(2));

    subscription.unsubscribe();
  });

  it('OUT_OF_STOCK re-fetches an active product subscription and rotates the key', async () => {
    server.use(transactionsHandler(409, ErrorCode.OUT_OF_STOCK));

    const product = products.find((candidate) => candidate.id === PRODUCT_ID);
    if (!product) {
      throw new Error('Fixture inconsistency: PRODUCT_ID missing from products fixture');
    }

    let productRequests = 0;
    server.use(
      http.get('*/api/v1/products/:id', () => {
        productRequests += 1;
        return HttpResponse.json({ data: product });
      }),
    );

    const { store, result } = setup();
    const keyBefore = selectIdempotencyKey(store.getState());

    const subscription = store.dispatch(catalogApi.endpoints.getProduct.initiate(PRODUCT_ID));
    await subscription;
    expect(productRequests).toBe(1);

    await act(() => result.current.pay(quoteFixture));

    expect(selectPaymentProblem(store.getState())).toEqual({ kind: 'OUT_OF_STOCK' });
    expect(selectIdempotencyKey(store.getState())).not.toBe(keyBefore);
    expect(readPendingPayment()).toBeNull();

    // Proves invalidateProduct was actually dispatched: the still-active
    // subscription re-fetches on its own once the Product tag is stale.
    await waitFor(() => expect(productRequests).toBe(2));

    subscription.unsubscribe();
  });

  it.each([ErrorCode.EMAIL_ALREADY_REGISTERED, ErrorCode.CUSTOMER_DATA_MISMATCH])(
    '%s from upsertCustomer goes to CONTACT with a field error, and createTransaction is never called',
    async (code) => {
      let transactionCalled = false;
      server.use(
        customersHandler(409, code),
        http.post('*/api/v1/transactions', () => {
          transactionCalled = true;
          return HttpResponse.json({ data: { id: transactionProgressingId } }, { status: 201 });
        }),
      );
      const { store, result } = setup();

      await act(() => result.current.pay(quoteFixture));

      expect(transactionCalled).toBe(false);
      expect(selectCheckoutStep(store.getState())).toBe('CONTACT');
      expect(selectContactFieldError(store.getState())).toEqual({ field: 'email', code });
    },
  );

  it.each([503, 429])('a %s response clears the pending entry and keeps the key', async (status) => {
    const code = status === 503 ? ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE : ErrorCode.RATE_LIMITED;
    server.use(transactionsHandler(status, code));
    const { store, result } = setup();
    const keyBefore = selectIdempotencyKey(store.getState());

    await act(() => result.current.pay(quoteFixture));

    expect(readPendingPayment()).toBeNull();
    expect(selectIdempotencyKey(store.getState())).toBe(keyBefore);
  });

  it('a network error keeps the pending entry, and retry() re-sends the same key and body to a 201', async () => {
    server.use(http.post('*/api/v1/transactions', () => HttpResponse.error()));
    const { store, result, getPathname } = setup();
    const keyBefore = selectIdempotencyKey(store.getState());

    await act(() => result.current.pay(quoteFixture));

    expect(selectPaymentProblem(store.getState())).toEqual({ kind: 'UNCERTAIN' });
    expect(selectIdempotencyKey(store.getState())).toBe(keyBefore);
    const pending = readPendingPayment();
    expect(pending).not.toBeNull();
    const bodyBefore = pending?.body;

    let receivedKey: string | null = null;
    let receivedBody: CreateTransactionRequest | undefined;
    server.use(
      http.post('*/api/v1/transactions', async ({ request }) => {
        receivedKey = request.headers.get('Idempotency-Key');
        receivedBody = (await request.json()) as CreateTransactionRequest;
        return HttpResponse.json(
          { data: { id: transactionProgressingId, status: 'PENDING' } },
          { status: 201 },
        );
      }),
    );

    await act(() => result.current.retry());

    expect(receivedKey).toBe(keyBefore);
    expect(receivedBody).toEqual(bodyBefore);
    expect(getPathname()).toBe(`/transactions/${transactionProgressingId}`);
    expect(readPendingPayment()).toBeNull();
  });

  it.each([400, 422])('a %s response rotates the key and clears the pending entry', async (status) => {
    server.use(transactionsHandler(status));
    const { store, result } = setup();
    const keyBefore = selectIdempotencyKey(store.getState());

    await act(() => result.current.pay(quoteFixture));

    expect(selectPaymentProblem(store.getState())).toEqual({ kind: 'FAILED' });
    expect(selectIdempotencyKey(store.getState())).not.toBe(keyBefore);
    expect(readPendingPayment()).toBeNull();
  });

  it('pay() is a no-op while a request is in flight', async () => {
    let customerCalls = 0;
    let resolveCustomer: () => void = () => undefined;
    server.use(
      http.post('*/api/v1/customers', async () => {
        customerCalls += 1;
        await new Promise<void>((resolve) => {
          resolveCustomer = resolve;
        });
        return HttpResponse.json({ data: customerFixture }, { status: 201 });
      }),
    );

    const { result } = setup();

    let firstCall!: Promise<void>;
    let secondCall!: Promise<void>;
    act(() => {
      firstCall = result.current.pay(quoteFixture);
      secondCall = result.current.pay(quoteFixture);
    });

    await waitFor(() => expect(result.current.isPaying).toBe(true));
    expect(customerCalls).toBe(1);

    resolveCustomer();
    await act(async () => {
      await Promise.all([firstCall, secondCall]);
    });

    expect(customerCalls).toBe(1);
  });
});
