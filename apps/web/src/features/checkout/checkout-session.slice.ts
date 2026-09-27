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

export interface CheckoutSessionState {
  contact: ContactDetails | null;
  quoteMunicipalityCode: string | null;
  card: CardSummary | null;
  installments: number;
  acceptance: AcceptanceTokens | null;
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
  },
});

export const { saveContact, setQuoteMunicipality, saveCard, clearCheckoutSession } =
  checkoutSessionSlice.actions;
export const {
  selectSessionContact,
  selectQuoteMunicipalityCode,
  selectCard,
  selectInstallments,
  selectAcceptance,
} = checkoutSessionSlice.selectors;
export const checkoutSessionReducer = checkoutSessionSlice.reducer;
