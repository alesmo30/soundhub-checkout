import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CustomerFormValues, DeliveryFormValues } from '@checkout/shared/validation';

// Mirrors checkout's `ContactDetails` (features/checkout/lib/contact-details.ts)
// structurally, without importing it: customer never imports from checkout
// (references/layering.md#web--by-feature).
export type RememberedAddress = Omit<DeliveryFormValues, 'recipientName' | 'phone'>;

export interface RememberedContactDetails {
  customer: CustomerFormValues;
  address: RememberedAddress;
}

export interface CustomerState {
  remembered: RememberedContactDetails | null;
}

const initialState: CustomerState = {
  remembered: null,
};

export const customerSlice = createSlice({
  name: 'customer',
  initialState,
  reducers: {
    rememberDetails(state, action: PayloadAction<RememberedContactDetails>) {
      state.remembered = action.payload;
    },
    forgetDetails(state) {
      state.remembered = null;
    },
  },
  selectors: {
    selectRememberedDetails: (state): RememberedContactDetails | null => state.remembered,
  },
});

export const { rememberDetails, forgetDetails } = customerSlice.actions;
export const { selectRememberedDetails } = customerSlice.selectors;
export const customerReducer = customerSlice.reducer;
