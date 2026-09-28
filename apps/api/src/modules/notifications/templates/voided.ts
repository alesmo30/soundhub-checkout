import { EMAIL_COLORS } from '../domain/notifications.constants';
import type { StatusTemplateMeta } from './layout';

export const VOIDED_TEMPLATE: StatusTemplateMeta = {
  subject: (reference) => `Tu pago fue anulado · ${reference}`,
  chip: {
    icon: '✕',
    label: 'Anulado',
    backgroundColor: EMAIL_COLORS.danger,
    textColor: EMAIL_COLORS.surface,
  },
  leadLine: (firstName) => `Hola, ${firstName}. El pago fue anulado y no se hizo ningún cobro.`,
  button: (links) => (links ? { label: 'Intentar de nuevo', url: links.retryUrl } : null),
};
