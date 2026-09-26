export const DeliveryStatus = {
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  READY_TO_SHIP: 'READY_TO_SHIP',
  CANCELLED: 'CANCELLED',
} as const;

export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];
