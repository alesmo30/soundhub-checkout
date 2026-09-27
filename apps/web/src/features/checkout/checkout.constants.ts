// Fixed copy for 2b (see specs/07-web-checkout.md#ui-rules, "Gateway errors"
// and "Test-mode note" rows). The UI switches on `tokenizeCard`'s `reason`,
// never on a message string from the gateway.
export const GATEWAY_ERROR_MESSAGES = {
  INVALID_CARD: 'Revisa los datos de tu tarjeta e inténtalo de nuevo.',
  UNAVAILABLE: 'No pudimos validar tu tarjeta. Inténtalo de nuevo en un momento.',
} as const;

export const TEST_MODE_NOTE =
  'En modo de pruebas solo funcionan las tarjetas 4242 4242 4242 4242 (aprobada) y 4111 1111 1111 1111 (rechazada).';
