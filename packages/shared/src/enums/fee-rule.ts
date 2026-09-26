export const FeeRule = {
  FREE_METRO: 'FREE_METRO',
  METRO_FLAT: 'METRO_FLAT',
  NATIONAL_DISTANCE: 'NATIONAL_DISTANCE',
} as const;

export type FeeRule = (typeof FeeRule)[keyof typeof FeeRule];
