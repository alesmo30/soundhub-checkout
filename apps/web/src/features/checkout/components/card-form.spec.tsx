import { screen, waitFor } from '@testing-library/react';
import { VALIDATION_MESSAGES } from '@checkout/shared/validation';
import { INSTALLMENTS_MAX } from '@checkout/shared/constants';

import { renderWithProviders } from '@/test/render-with-providers';

import { CardForm } from './card-form';

beforeAll(() => {
  // Radix Select needs these in jsdom (see components/ui/select.spec.tsx).
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.scrollIntoView = jest.fn();
});

function renderCardForm() {
  return renderWithProviders(<CardForm />);
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
});
