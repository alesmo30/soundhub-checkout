import { EMAIL_COLORS } from '../domain/notifications.constants';
import type { StatusTemplateMeta } from './layout';

export const EXPIRED_TEMPLATE: StatusTemplateMeta = {
  subject: (reference) => `Tu pago no se completó · ${reference}`,
  chip: {
    icon: '⚠',
    label: 'No completado',
    backgroundColor: EMAIL_COLORS.warning,
    textColor: EMAIL_COLORS.ink,
  },
  leadLine: (firstName) => `Hola, ${firstName}. Tu pago no se completó y no se hizo ningún cobro.`,
  button: (links) => (links ? { label: 'Intentar de nuevo', url: links.retryUrl } : null),
};
