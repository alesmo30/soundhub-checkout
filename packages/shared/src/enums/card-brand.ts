export const CardBrand = {
  VISA: 'VISA',
  MASTERCARD: 'MASTERCARD',
} as const;

export type CardBrand = (typeof CardBrand)[keyof typeof CardBrand];
