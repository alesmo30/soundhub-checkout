import { EMAIL_COLORS } from '../domain/notifications.constants';
import type { StatusTemplateMeta } from './layout';

export const DECLINED_TEMPLATE: StatusTemplateMeta = {
  subject: (reference) => `Tu pago fue rechazado · ${reference}`,
  chip: {
    icon: '✕',
    label: 'Rechazado',
    backgroundColor: EMAIL_COLORS.danger,
    textColor: EMAIL_COLORS.surface,
  },
  leadLine: (firstName) => `Hola, ${firstName}. Tu banco rechazó el pago. No se hizo ningún cobro.`,
  button: (links) => (links ? { label: 'Intentar de nuevo', url: links.retryUrl } : null),
};
