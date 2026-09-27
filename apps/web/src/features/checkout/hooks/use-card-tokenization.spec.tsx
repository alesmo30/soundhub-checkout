import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { HttpResponse, http } from 'msw';
import type { CardFormValues } from '@checkout/shared/validation';
import { CardBrand } from '@checkout/shared/enums';

import { makeStore, type AppStore } from '@/app/store';
import { server } from '@/mocks/server';

import { useCardTokenization } from './use-card-tokenization';

const CARD: CardFormValues = {
  holder: 'Jane Doe',
  number: '4242424242424242',
  expiry: '12/29',
  cvc: '123',
  installments: 3,
};

function setup(store: AppStore = makeStore()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return { store, result: renderHook(() => useCardTokenization(), { wrapper }).result };
}

describe('useCardTokenization', () => {
  it('resolves the acceptance terms and enables submit only once both checkboxes are accepted', async () => {
    const { result } = setup();

    await waitFor(() => expect(result.current.isTermsLoading).toBe(false));
    expect(result.current.termsUrl).toBe('https://example.test/terms-and-conditions');
    expect(result.current.personalDataUrl).toBe('https://example.test/personal-data-auth');
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.setAcceptedTerms(true));
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.setAcceptedPersonalData(true));
    expect(result.current.canSubmit).toBe(true);
  });

  it('surfaces a terms error and canSubmit stays false until a refetch succeeds', async () => {
    server.use(http.get('*/merchants/:publicKey', () => HttpResponse.json({}, { status: 500 })));
    const { result } = setup();

    await waitFor(() => expect(result.current.isTermsError).toBe(true));
    act(() => result.current.setAcceptedTerms(true));
    act(() => result.current.setAcceptedPersonalData(true));
    expect(result.current.canSubmit).toBe(false);
  });

  it('saveCard stores the token/brand/last4, the installments and both acceptance tokens on success', async () => {
    const { store, result } = setup();
    await waitFor(() => expect(result.current.isTermsLoading).toBe(false));
    act(() => {
      result.current.setAcceptedTerms(true);
      result.current.setAcceptedPersonalData(true);
    });

    await act(() => result.current.submit(CARD));

    expect(store.getState().checkoutSession).toMatchObject({
      card: { token: 'tok_test_4242', brand: CardBrand.VISA, last4: '4242' },
      installments: 3,
      acceptance: {
        acceptanceToken: 'test-acceptance-token',
        personalDataAuthToken: 'test-personal-data-token',
      },
    });
    expect(store.getState().checkout.step).toBe('SUMMARY');
    expect(result.current.gatewayError).toBeNull();
  });

  it('sets gatewayError to INVALID_CARD on a 422 and never dispatches goToStep', async () => {
    const { store, result } = setup();
    await waitFor(() => expect(result.current.isTermsLoading).toBe(false));
    act(() => {
      result.current.setAcceptedTerms(true);
      result.current.setAcceptedPersonalData(true);
    });

    await act(() => result.current.submit({ ...CARD, number: '9999999999999999' }));

    expect(result.current.gatewayError).toBe('INVALID_CARD');
    expect(store.getState().checkout.step).toBe('CONTACT');
    expect(store.getState().checkoutSession.card).toBeNull();
  });

  it('sets gatewayError to UNAVAILABLE on a 500', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isTermsLoading).toBe(false));
    act(() => {
      result.current.setAcceptedTerms(true);
      result.current.setAcceptedPersonalData(true);
    });
    server.use(http.post('*/tokens/cards', () => HttpResponse.json({}, { status: 500 })));

    await act(() => result.current.submit(CARD));

    expect(result.current.gatewayError).toBe('UNAVAILABLE');
  });

  it('reflects isTokenizing while the request is pending', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isTermsLoading).toBe(false));
    act(() => {
      result.current.setAcceptedTerms(true);
      result.current.setAcceptedPersonalData(true);
    });

    let resolveRequest: () => void = () => undefined;
    server.use(
      http.post('*/tokens/cards', async () => {
        await new Promise<void>((resolve) => {
          resolveRequest = resolve;
        });

        return HttpResponse.json(
          { data: { id: 'tok_test_4242', brand: 'VISA', last_four: '4242' } },
          { status: 201 },
        );
      }),
    );

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit(CARD);
    });

    await waitFor(() => expect(result.current.isTokenizing).toBe(true));

    resolveRequest();
    await act(() => submitPromise);

    expect(result.current.isTokenizing).toBe(false);
  });
});
