import { act, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { persistStore } from 'redux-persist';
import { VALIDATION_MESSAGES } from '@checkout/shared/validation';
import { INSTALLMENTS_MAX } from '@checkout/shared/constants';

import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render-with-providers';
import { TEST_MODE_NOTE } from '../checkout.constants';

import { CardForm } from './card-form';

beforeAll(() => {
  // Radix Select needs these in jsdom (see components/ui/select.spec.tsx).
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.scrollIntoView = jest.fn();
});

function renderCardForm() {
  return renderWithProviders(<CardForm />);
}

// Flushes the zod resolver's own microtask tick inside an `act` boundary, so
// react-hook-form's late `isValidating` update never lands after the test
// (and its interactions) already returned.
async function settle() {
  await act(() => Promise.resolve());
}

async function fillValidCard(user: UserEvent, number = '4242424242424242') {
  await user.type(screen.getByLabelText('Número de tarjeta'), number);
  await user.type(screen.getByLabelText('Nombre en la tarjeta'), 'Jane Doe');
  await user.type(screen.getByLabelText('MM/AA'), '1229');
  await user.type(screen.getByLabelText('CVC'), '391');
  await user.tab();
  await settle();
}

async function acceptLegalTerms(user: UserEvent) {
  await user.click(await screen.findByRole('checkbox', { name: /términos y condiciones/ }));
  await user.click(screen.getByRole('checkbox', { name: /tratamiento de mis datos personales/ }));
  await settle();
}

describe('CardForm', () => {
  it('renders the empty form with installments defaulted to 1 cuota and "Continuar" disabled', () => {
    renderCardForm();

    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('');
    expect(screen.getByLabelText('Nombre en la tarjeta')).toHaveValue('');
    expect(screen.getByLabelText('MM/AA')).toHaveValue('');
    expect(screen.getByLabelText('CVC')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Cuotas' })).toHaveTextContent('1 cuota');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });

  it('masks the card number as 4242 4242 4242 4242 while typing', async () => {
    const { user } = renderCardForm();

    await user.type(screen.getByLabelText('Número de tarjeta'), '4242424242424242');

    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('4242 4242 4242 4242');
  });

  it('inserts the / automatically in MM/AA', async () => {
    const { user } = renderCardForm();

    await user.type(screen.getByLabelText('MM/AA'), '1229');

    expect(screen.getByLabelText('MM/AA')).toHaveValue('12/29');
  });

  it('shows the VISA logo for a 4-prefixed number', async () => {
    const { user } = renderCardForm();

    await user.type(screen.getByLabelText('Número de tarjeta'), '4');

    expect(screen.getByRole('img', { name: 'VISA' })).toBeInTheDocument();
  });

  it('shows the Mastercard logo for a 51-prefixed number', async () => {
    const { user } = renderCardForm();

    await user.type(screen.getByLabelText('Número de tarjeta'), '51');

    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeInTheDocument();
  });

  it('shows no logo for a 56-prefixed number', async () => {
    const { user } = renderCardForm();

    await user.type(screen.getByLabelText('Número de tarjeta'), '56');

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows one validation message per field (Luhn, expired, CVC, holder)', async () => {
    const { user } = renderCardForm();

    await user.type(screen.getByLabelText('Número de tarjeta'), '4242424242424241');
    await user.type(screen.getByLabelText('Nombre en la tarjeta'), 'Al');
    await user.type(screen.getByLabelText('MM/AA'), '0120');
    await user.type(screen.getByLabelText('CVC'), '12');
    await user.tab();

    await waitFor(() =>
      expect(screen.getByText(VALIDATION_MESSAGES.CARD_NUMBER_INVALID)).toBeInTheDocument(),
    );
    expect(screen.getByText(VALIDATION_MESSAGES.CARD_HOLDER_INVALID)).toBeInTheDocument();
    expect(screen.getByText(VALIDATION_MESSAGES.CARD_EXPIRY_EXPIRED)).toBeInTheDocument();
    expect(screen.getByText(VALIDATION_MESSAGES.CARD_CVC_INVALID)).toBeInTheDocument();

    const numberField = screen.getByLabelText('Número de tarjeta');
    const describedBy = numberField.getAttribute('aria-describedby') ?? '';
    const messageId = describedBy.split(' ').find((id) => id.endsWith('-form-item-message'));
    expect(messageId).toBeDefined();
  });

  it('offers 36 installment options', async () => {
    const { user } = renderCardForm();

    await user.click(screen.getByRole('combobox', { name: 'Cuotas' }));

    expect(await screen.findByRole('option', { name: '1 cuota' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: `${INSTALLMENTS_MAX} cuotas` })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(INSTALLMENTS_MAX);
  });

  it('dispatches goToStep(\'CONTACT\') from "Volver"', async () => {
    const { user, store } = renderCardForm();

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(store.getState().checkout.step).toBe('CONTACT');
  });

  it('always shows the test-mode note', () => {
    renderCardForm();

    expect(screen.getByText(TEST_MODE_NOTE)).toBeInTheDocument();
  });

  it('"Continuar" stays disabled until both legal checkboxes are checked, even with a valid card', async () => {
    const { user } = renderCardForm();
    await fillValidCard(user);
    await screen.findByRole('checkbox', { name: /términos y condiciones/ });

    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /términos y condiciones/ }));
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /tratamiento de mis datos personales/ }));
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });

  it('shows a terms error with "Reintentar", which recovers the checkboxes', async () => {
    server.use(http.get('*/merchants/:publicKey', () => HttpResponse.json({}, { status: 500 })));
    const { user } = renderCardForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar los términos y condiciones.',
    );

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('checkbox', { name: /términos y condiciones/ })).toBeInTheDocument();
  });

  it('tokenizes 4242, saves the session and moves to SUMMARY', async () => {
    const { user, store } = renderCardForm();
    await fillValidCard(user);
    await acceptLegalTerms(user);

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(store.getState().checkoutSession.card).not.toBeNull());
    expect(store.getState().checkoutSession).toMatchObject({
      card: { token: 'tok_test_4242', brand: 'VISA', last4: '4242' },
      installments: 1,
      acceptance: {
        acceptanceToken: 'test-acceptance-token',
        personalDataAuthToken: 'test-personal-data-token',
      },
    });
    expect(store.getState().checkout.step).toBe('SUMMARY');
  });

  it('shows the INVALID_CARD message on a 422 and stays on CARD', async () => {
    const { user, store } = renderCardForm();
    // A Luhn-valid number that is not in the mock's approved prefixes.
    await fillValidCard(user, '5555555555554444');
    await acceptLegalTerms(user);

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revisa los datos de tu tarjeta e inténtalo de nuevo.',
    );
    expect(store.getState().checkoutSession.card).toBeNull();
    expect(store.getState().checkout.step).not.toBe('SUMMARY');
  });

  it('shows the UNAVAILABLE message on a 500', async () => {
    server.use(http.post('*/tokens/cards', () => HttpResponse.json({}, { status: 500 })));
    const { user, store } = renderCardForm();
    await fillValidCard(user);
    await acceptLegalTerms(user);

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos validar tu tarjeta. Inténtalo de nuevo en un momento.',
    );
    expect(store.getState().checkoutSession.card).toBeNull();
  });

  it('shows "Validando tarjeta…" and disables the button while tokenizing', async () => {
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
    const { user } = renderCardForm();
    await fillValidCard(user);
    await acceptLegalTerms(user);

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const pendingButton = await screen.findByRole('button', { name: 'Validando tarjeta…' });
    expect(pendingButton).toBeDisabled();

    resolveRequest();
    expect(await screen.findByRole('button', { name: 'Continuar' })).toBeEnabled();
  });

  it('after a successful submit, neither the Redux state (including api) nor localStorage contains the card number or the CVC, and nothing is logged', async () => {
    localStorage.clear();

    const CARD_NUMBER = '4242424242424242';
    const CVC = '391';

    const { user, store } = renderCardForm();
    const persistor = persistStore(store);
    await new Promise<void>((resolve) => {
      const unsubscribe = persistor.subscribe(() => {
        if (persistor.getState().bootstrapped) {
          unsubscribe();
          resolve();
        }
      });
    });

    await fillValidCard(user, CARD_NUMBER);
    await acceptLegalTerms(user);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled());

    // The spy window is scoped to the tokenization submit itself (typing and
    // toggling checkboxes happen before it), matching the acceptance
    // criterion literally: "no console output happens during tokenization".
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(store.getState().checkoutSession.card).not.toBeNull());
    await persistor.flush();

    const stateJson = JSON.stringify(store.getState());
    expect(stateJson).not.toContain(CARD_NUMBER);
    expect(stateJson).not.toContain(CVC);
    expect(stateJson).not.toContain('4242 4242 4242 4242');

    const rawPersisted = localStorage.getItem('persist:soundhub');
    expect(rawPersisted).not.toBeNull();
    expect(rawPersisted).not.toContain(CARD_NUMBER);
    expect(rawPersisted).not.toContain(CVC);

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
