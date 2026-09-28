import { EMAIL_COLORS } from '../domain/notifications.constants';
import type { StatusTemplateMeta } from './layout';

export const ERROR_TEMPLATE: StatusTemplateMeta = {
  subject: (reference) => `No pudimos procesar tu pago · ${reference}`,
  chip: {
    icon: '✕',
    label: 'Error',
    backgroundColor: EMAIL_COLORS.danger,
    textColor: EMAIL_COLORS.surface,
  },
  leadLine: (firstName) =>
    `Hola, ${firstName}. Hubo un problema al procesar tu pago. No se hizo ningún cobro.`,
  button: (links) => (links ? { label: 'Intentar de nuevo', url: links.retryUrl } : null),
};
