// Fixed copy for 2b (see specs/07-web-checkout.md#ui-rules, "Gateway errors"
// and "Test-mode note" rows). The UI switches on `tokenizeCard`'s `reason`,
// never on a message string from the gateway.
export const GATEWAY_ERROR_MESSAGES = {
  INVALID_CARD: 'Revisa los datos de tu tarjeta e inténtalo de nuevo.',
  UNAVAILABLE: 'No pudimos validar tu tarjeta. Inténtalo de nuevo en un momento.',
} as const;

export const TEST_MODE_NOTE =
  'En modo de pruebas solo funcionan las tarjetas 4242 4242 4242 4242 (aprobada) y 4111 1111 1111 1111 (rechazada).';

// The delivery fee row in the summary (see specs/11-web-payment.md#copy).
// NATIONAL_DISTANCE appends its distance separately, since the km figure is
// per-quote data, not fixed copy.
export const FEE_RULE_LABEL = {
  FREE_METRO: 'Envío gratis',
  METRO_FLAT: 'Envío área metropolitana',
  NATIONAL_DISTANCE: 'Envío nacional',
} as const;

// One message per `PaymentProblem.kind` (see specs/11-web-payment.md
// #outcome-table). The UI never renders the gateway's raw status message.
export const PAYMENT_PROBLEM_MESSAGES = {
  OUT_OF_STOCK: 'Ya no hay unidades suficientes para tu pedido. No se hizo ningún cobro.',
  UNAVAILABLE: 'Los pagos no están disponibles en este momento. Inténtalo de nuevo en unos segundos.',
  RATE_LIMITED: 'Hiciste demasiados intentos. Espera un momento e inténtalo de nuevo.',
  UNCERTAIN: 'No pudimos confirmar tu pago. No pagues de nuevo: toca Reintentar para verificarlo.',
  FAILED: 'No pudimos procesar tu pago. No se hizo ningún cobro.',
} as const;
