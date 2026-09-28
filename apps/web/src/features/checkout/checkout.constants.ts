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

// One message per `ContactFieldError.code` (see specs/11-web-payment.md
// #outcome-table). Both customer conflicts highlight the email field,
// never the national ID (see specs/11-web-payment.md#decisions, "Errors").
export const CONTACT_FIELD_ERROR_MESSAGES = {
  EMAIL_ALREADY_REGISTERED: 'Este correo ya está registrado con otro documento. Usa otro correo.',
  CUSTOMER_DATA_MISMATCH:
    'Este documento ya está registrado con otro correo. Usa el correo con el que compraste antes.',
} as const;

// Shown once by PendingPaymentRecovery (step 6) after a refresh recovers a
// payment that turned out definitively unsuccessful: the tokenized card
// from before the refresh never survives the reload (checkoutSession is
// memory-only), so the customer must re-enter one (see
// specs/11-web-payment.md#outcome-table, "PendingPaymentRecovery uses the
// same table").
export const PENDING_PAYMENT_RECOVERY_NOTICE =
  'Tu pago anterior no se completó y no se hizo ningún cobro. Ingresa tu tarjeta de nuevo.';

// One message per `PaymentProblem.kind` (see specs/11-web-payment.md
// #outcome-table). The UI never renders the gateway's raw status message.
export const PAYMENT_PROBLEM_MESSAGES = {
  OUT_OF_STOCK: 'Ya no hay unidades suficientes para tu pedido. No se hizo ningún cobro.',
  UNAVAILABLE:
    'Los pagos no están disponibles en este momento. Inténtalo de nuevo en unos segundos.',
  RATE_LIMITED: 'Hiciste demasiados intentos. Espera un momento e inténtalo de nuevo.',
  UNCERTAIN: 'No pudimos confirmar tu pago. No pagues de nuevo: toca Reintentar para verificarlo.',
  FAILED: 'No pudimos procesar tu pago. No se hizo ningún cobro.',
} as const;
