import { createSlice } from '@reduxjs/toolkit';

export type CheckoutState = Record<string, never>;

const initialState: CheckoutState = {};

export const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {},
});

export const checkoutReducer = checkoutSlice.reducer;
