import { CardBrand } from '@checkout/shared/enums';

import { forgetDetails } from '@/features/customer';

import { closeCheckout } from './checkout.slice';
import {
  checkoutSessionReducer,
  clearCheckoutSession,
  ensureIdempotencyKey,
  rotateIdempotencyKey,
  saveCard,
  saveContact,
  selectAcceptance,
  selectCard,
  selectContactFieldError,
  selectIdempotencyKey,
  selectInstallments,
  selectPaymentProblem,
  selectQuoteMunicipalityCode,
  selectSessionContact,
  setContactFieldError,
  setPaymentProblem,
  setQuoteMunicipality,
  type CheckoutSessionState,
} from './checkout-session.slice';
import type { ContactDetails } from './lib/contact-details';

const CONTACT: ContactDetails = {
  customer: {
    documentNumber: '1234567890',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '3001234567',
  },
  address: {
    departmentCode: '05',
    municipalityCode: '05001',
    addressLine: 'Calle 1 # 2-3',
  },
};

const CARD = { token: 'tok_test_123', brand: CardBrand.VISA, last4: '4242' };
const ACCEPTANCE = {
  acceptanceToken: 'test-acceptance-token',
  personalDataAuthToken: 'test-personal-data-token',
};

function reduce(...actions: Parameters<typeof checkoutSessionReducer>[1][]): CheckoutSessionState {
  return actions.reduce(
    checkoutSessionReducer,
    checkoutSessionReducer(undefined, { type: '@@init' }),
  );
}

describe('checkoutSession slice', () => {
  it('starts empty with the default installments', () => {
    expect(reduce()).toEqual({
      contact: null,
      quoteMunicipalityCode: null,
      card: null,
      installments: 1,
      acceptance: null,
      idempotencyKey: null,
      paymentProblem: null,
      contactFieldError: null,
    });
  });

  it('saveContact stores the contact details', () => {
    expect(reduce(saveContact(CONTACT)).contact).toEqual(CONTACT);
  });

  it('setQuoteMunicipality stores the chosen municipality', () => {
    expect(reduce(setQuoteMunicipality('05001')).quoteMunicipalityCode).toBe('05001');
  });

  it('saveCard stores the card, installments and acceptance tokens together', () => {
    const state = reduce(saveCard({ card: CARD, installments: 3, acceptance: ACCEPTANCE }));

    expect(state.card).toEqual(CARD);
    expect(state.installments).toBe(3);
    expect(state.acceptance).toEqual(ACCEPTANCE);
  });

  it('clearCheckoutSession resets everything to its initial value', () => {
    const state = reduce(
      saveContact(CONTACT),
      saveCard({ card: CARD, installments: 3, acceptance: ACCEPTANCE }),
      clearCheckoutSession(),
    );

    expect(state).toEqual({
      contact: null,
      quoteMunicipalityCode: null,
      card: null,
      installments: 1,
      acceptance: null,
      idempotencyKey: null,
      paymentProblem: null,
      contactFieldError: null,
    });
  });

  it('closeCheckout drops the card and acceptance tokens but keeps the contact', () => {
    const state = reduce(
      saveContact(CONTACT),
      saveCard({ card: CARD, installments: 3, acceptance: ACCEPTANCE }),
      closeCheckout(),
    );

    expect(state.contact).toEqual(CONTACT);
    expect(state.card).toBeNull();
    expect(state.acceptance).toBeNull();
  });

  it('closeCheckout clears the idempotency key and the payment problem', () => {
    const state = reduce(
      ensureIdempotencyKey(),
      setPaymentProblem({ kind: 'RATE_LIMITED' }),
      closeCheckout(),
    );

    expect(state.idempotencyKey).toBeNull();
    expect(state.paymentProblem).toBeNull();
  });

  it('ensureIdempotencyKey sets a key only when there is none yet', () => {
    const withKey = reduce(ensureIdempotencyKey());

    expect(withKey.idempotencyKey).not.toBeNull();

    const kept = checkoutSessionReducer(withKey, ensureIdempotencyKey());

    expect(kept.idempotencyKey).toBe(withKey.idempotencyKey);
  });

  it('rotateIdempotencyKey always replaces the key', () => {
    const withKey = reduce(ensureIdempotencyKey());
    const rotated = checkoutSessionReducer(withKey, rotateIdempotencyKey());

    expect(rotated.idempotencyKey).not.toBeNull();
    expect(rotated.idempotencyKey).not.toBe(withKey.idempotencyKey);
  });

  it('setPaymentProblem stores and clears the problem', () => {
    const withProblem = reduce(setPaymentProblem({ kind: 'OUT_OF_STOCK' }));

    expect(withProblem.paymentProblem).toEqual({ kind: 'OUT_OF_STOCK' });

    const cleared = checkoutSessionReducer(withProblem, setPaymentProblem(null));

    expect(cleared.paymentProblem).toBeNull();
  });

  it('setContactFieldError stores and clears the field error', () => {
    const withError = reduce(
      setContactFieldError({ field: 'email', code: 'EMAIL_ALREADY_REGISTERED' }),
    );

    expect(withError.contactFieldError).toEqual({
      field: 'email',
      code: 'EMAIL_ALREADY_REGISTERED',
    });

    const cleared = checkoutSessionReducer(withError, setContactFieldError(null));

    expect(cleared.contactFieldError).toBeNull();
  });

  it('forgetDetails resets the whole session, contact included', () => {
    const state = reduce(
      saveContact(CONTACT),
      saveCard({ card: CARD, installments: 3, acceptance: ACCEPTANCE }),
      forgetDetails(),
    );

    expect(state).toEqual({
      contact: null,
      quoteMunicipalityCode: null,
      card: null,
      installments: 1,
      acceptance: null,
      idempotencyKey: null,
      paymentProblem: null,
      contactFieldError: null,
    });
  });
});

describe('checkoutSession selectors', () => {
  it('selectSessionContact / selectQuoteMunicipalityCode / selectCard / selectInstallments / selectAcceptance', () => {
    const checkoutSession = reduce(
      saveContact(CONTACT),
      setQuoteMunicipality('05001'),
      saveCard({ card: CARD, installments: 6, acceptance: ACCEPTANCE }),
    );

    expect(selectSessionContact({ checkoutSession })).toEqual(CONTACT);
    expect(selectQuoteMunicipalityCode({ checkoutSession })).toBe('05001');
    expect(selectCard({ checkoutSession })).toEqual(CARD);
    expect(selectInstallments({ checkoutSession })).toBe(6);
    expect(selectAcceptance({ checkoutSession })).toEqual(ACCEPTANCE);
  });

  it('selectIdempotencyKey / selectPaymentProblem / selectContactFieldError', () => {
    const checkoutSession = reduce(
      ensureIdempotencyKey(),
      setPaymentProblem({ kind: 'UNCERTAIN' }),
      setContactFieldError({ field: 'email', code: 'CUSTOMER_DATA_MISMATCH' }),
    );

    expect(selectIdempotencyKey({ checkoutSession })).not.toBeNull();
    expect(selectPaymentProblem({ checkoutSession })).toEqual({ kind: 'UNCERTAIN' });
    expect(selectContactFieldError({ checkoutSession })).toEqual({
      field: 'email',
      code: 'CUSTOMER_DATA_MISMATCH',
    });
  });
});
