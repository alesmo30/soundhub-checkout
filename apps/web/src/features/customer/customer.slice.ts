import { createSlice } from '@reduxjs/toolkit';

export type CustomerState = Record<string, never>;

const initialState: CustomerState = {};

export const customerSlice = createSlice({
  name: 'customer',
  initialState,
  reducers: {},
});

export const customerReducer = customerSlice.reducer;
