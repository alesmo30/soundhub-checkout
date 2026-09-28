import { EMAIL_COLORS } from '../domain/notifications.constants';
import type { StatusTemplateMeta } from './layout';

export const APPROVED_TEMPLATE: StatusTemplateMeta = {
  subject: (reference) => `¡Tu pago fue aprobado! · ${reference}`,
  chip: {
    icon: '✓',
    label: 'Aprobado',
    backgroundColor: EMAIL_COLORS.brandMint,
    textColor: EMAIL_COLORS.ink,
  },
  leadLine: (firstName) =>
    `Hola, ${firstName}. Recibimos tu pago y tu pedido ya está listo para envío.`,
  button: (links) => (links ? { label: 'Ver mi pedido', url: links.orderUrl } : null),
};
