import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const MIN_QUANTITY = 1;

export type CheckoutStep = 'CONTACT' | 'CARD' | 'SUMMARY';

const INITIAL_STEP: CheckoutStep = 'CONTACT';

export interface CheckoutState {
  productId: string | null;
  quantity: number;
  isDialogOpen: boolean;
  step: CheckoutStep;
}

export interface ProductQuantity {
  productId: string;
  quantity: number;
}

const initialState: CheckoutState = {
  productId: null,
  quantity: MIN_QUANTITY,
  isDialogOpen: false,
  step: INITIAL_STEP,
};

// The upper bound depends on the product's current stock, so the page clamps
// it; the slice only guarantees the lower bound.
function atLeastMin(quantity: number): number {
  return Math.max(MIN_QUANTITY, Math.trunc(quantity));
}

export const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {
    setQuantity(state, action: PayloadAction<ProductQuantity>) {
      state.productId = action.payload.productId;
      state.quantity = atLeastMin(action.payload.quantity);
    },
    startCheckout(state, action: PayloadAction<ProductQuantity>) {
      state.productId = action.payload.productId;
      state.quantity = atLeastMin(action.payload.quantity);
      state.isDialogOpen = true;
    },
    closeCheckout(state) {
      state.isDialogOpen = false;
    },
    goToStep(state, action: PayloadAction<CheckoutStep>) {
      state.step = action.payload;
    },
    resetCheckout() {
      return initialState;
    },
  },
  selectors: {
    // A quantity saved for another product must not leak into this one.
    selectQuantityFor: (state, productId: string): number =>
      state.productId === productId ? state.quantity : MIN_QUANTITY,
    selectIsCheckoutOpen: (state): boolean => state.isDialogOpen,
    selectCheckoutProductId: (state): string | null => state.productId,
    selectCheckoutStep: (state): CheckoutStep => state.step,
  },
});

export const { setQuantity, startCheckout, closeCheckout, goToStep, resetCheckout } =
  checkoutSlice.actions;
export const {
  selectQuantityFor,
  selectIsCheckoutOpen,
  selectCheckoutProductId,
  selectCheckoutStep,
} = checkoutSlice.selectors;
export const checkoutReducer = checkoutSlice.reducer;
