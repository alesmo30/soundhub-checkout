import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CardBrand } from '@checkout/shared/enums';

import { forgetDetails } from '@/features/customer';

import { closeCheckout } from './checkout.slice';
import type { ContactDetails } from './lib/contact-details';

const DEFAULT_INSTALLMENTS = 1;

export interface CardSummary {
  token: string;
  brand: CardBrand;
  last4: string;
}

export interface AcceptanceTokens {
  acceptanceToken: string;
  personalDataAuthToken: string;
}

// See specs/11-web-payment.md#outcome-table for how each kind maps to a key
// and pending-entry action.
export type PaymentProblem =
  | { kind: 'PRICE_CHANGED'; previousTotalInCents: number }
  | { kind: 'OUT_OF_STOCK' }
  | { kind: 'UNAVAILABLE' }
  | { kind: 'RATE_LIMITED' }
  | { kind: 'UNCERTAIN' }
  | { kind: 'FAILED' };

export interface ContactFieldError {
  field: 'email';
  code: 'EMAIL_ALREADY_REGISTERED' | 'CUSTOMER_DATA_MISMATCH';
}

export interface CheckoutSessionState {
  contact: ContactDetails | null;
  quoteMunicipalityCode: string | null;
  card: CardSummary | null;
  installments: number;
  acceptance: AcceptanceTokens | null;
  idempotencyKey: string | null;
  paymentProblem: PaymentProblem | null;
  contactFieldError: ContactFieldError | null;
}

export interface SaveCardPayload {
  card: CardSummary;
  installments: number;
  acceptance: AcceptanceTokens;
}

const initialState: CheckoutSessionState = {
  contact: null,
  quoteMunicipalityCode: null,
  card: null,
  installments: DEFAULT_INSTALLMENTS,
  acceptance: null,
  idempotencyKey: null,
  paymentProblem: null,
  contactFieldError: null,
};

export const checkoutSessionSlice = createSlice({
  name: 'checkoutSession',
  initialState,
  reducers: {
    saveContact(state, action: PayloadAction<ContactDetails>) {
      state.contact = action.payload;
    },
    setQuoteMunicipality(state, action: PayloadAction<string>) {
      state.quoteMunicipalityCode = action.payload;
    },
    saveCard(state, action: PayloadAction<SaveCardPayload>) {
      state.card = action.payload.card;
      state.installments = action.payload.installments;
      state.acceptance = action.payload.acceptance;
    },
    // Kept across "Reintentar" after an uncertain failure: a new key would
    // let a lost response and a retry both create a transaction.
    ensureIdempotencyKey(state) {
      if (state.idempotencyKey === null) {
        state.idempotencyKey = crypto.randomUUID();
      }
    },
    // Always a fresh key, for whenever the request body changes ("Editar",
    // a re-quote, a corrected contact): reusing the old key with a new body
    // would get 422 IDEMPOTENCY_KEY_REUSED.
    rotateIdempotencyKey(state) {
      state.idempotencyKey = crypto.randomUUID();
    },
    setPaymentProblem(state, action: PayloadAction<PaymentProblem | null>) {
      state.paymentProblem = action.payload;
    },
    setContactFieldError(state, action: PayloadAction<ContactFieldError | null>) {
      state.contactFieldError = action.payload;
    },
    clearCheckoutSession() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      // The card is always entered again after closing the dialog; the
      // contact details are still worth keeping for a same-session reopen.
      .addCase(closeCheckout, (state) => {
        state.card = null;
        state.acceptance = null;
        state.idempotencyKey = null;
        state.paymentProblem = null;
      })
      // Forgetting the remembered details also drops any in-progress
      // session built from them.
      .addCase(forgetDetails, () => initialState);
  },
  selectors: {
    selectSessionContact: (state): ContactDetails | null => state.contact,
    selectQuoteMunicipalityCode: (state): string | null => state.quoteMunicipalityCode,
    selectCard: (state): CardSummary | null => state.card,
    selectInstallments: (state): number => state.installments,
    selectAcceptance: (state): AcceptanceTokens | null => state.acceptance,
    selectIdempotencyKey: (state): string | null => state.idempotencyKey,
    selectPaymentProblem: (state): PaymentProblem | null => state.paymentProblem,
    selectContactFieldError: (state): ContactFieldError | null => state.contactFieldError,
  },
});

export const {
  saveContact,
  setQuoteMunicipality,
  saveCard,
  ensureIdempotencyKey,
  rotateIdempotencyKey,
  setPaymentProblem,
  setContactFieldError,
  clearCheckoutSession,
} = checkoutSessionSlice.actions;
export const {
  selectSessionContact,
  selectQuoteMunicipalityCode,
  selectCard,
  selectInstallments,
  selectAcceptance,
  selectIdempotencyKey,
  selectPaymentProblem,
  selectContactFieldError,
} = checkoutSessionSlice.selectors;
export const checkoutSessionReducer = checkoutSessionSlice.reducer;
