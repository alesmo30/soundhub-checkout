import type { DeliveryStatus } from '@checkout/shared/enums';

// apps/web/DESIGN.md's token palette, inlined: emails render outside the
// web app's Tailwind build, so the hex values are copied rather than shared.
export const BRAND_NAME = 'SoundHub';

export const EMAIL_COLORS = {
  ink: '#2C2A29',
  brandLime: '#DFFF61',
  brandMint: '#B0F2AE',
  surface: '#FFFFFF',
  borderSubtle: '#E4E4E4',
  danger: '#D93A3A',
  warning: '#F5A524',
} as const;

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  READY_TO_SHIP: 'Listo para envío',
  CANCELLED: 'Cancelado',
  AWAITING_PAYMENT: 'Esperando pago',
};

export const EMAIL_FOOTER = 'Pago seguro · Correo automático, no respondas a este mensaje.';
