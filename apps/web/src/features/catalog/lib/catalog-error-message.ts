import { ErrorCode } from '@checkout/shared/enums';

import { getErrorCode } from '@/services/api';

const RATE_LIMITED_MESSAGE =
  'Hiciste muchas solicitudes seguidas. Espera un momento e inténtalo de nuevo.';
const GENERIC_MESSAGE = 'No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.';

export function catalogErrorMessage(error: unknown): string {
  return getErrorCode(error) === ErrorCode.RATE_LIMITED ? RATE_LIMITED_MESSAGE : GENERIC_MESSAGE;
}
