import { DeliveryStatus, TransactionStatus } from '@checkout/shared/enums';

// Polling cadence for /transactions/:id (specs/11-web-payment.md#scope).
// The server's Retry-After header overrides POLL_INTERVAL_MS per response;
// POLL_TIMEOUT_MS bounds how long a single window of continuous PENDING
// polls before the page moves to "under review".
export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 60_000;

export type StatusTone = 'success' | 'danger' | 'warning';

// One title and tone per TransactionStatus (specs/11-web-payment.md#copy).
// The status page renders only this fixed copy — never the gateway's raw
// `statusMessage` (CLAUDE.md, "the card number and CVC never reach..." plus
// DESIGN.md §6: the UI chooses messages by code, not by text).
export const STATUS_COPY: Record<TransactionStatus, { title: string; tone: StatusTone }> = {
  [TransactionStatus.APPROVED]: { title: '¡Pago aprobado!', tone: 'success' },
  [TransactionStatus.DECLINED]: { title: 'Tu pago fue rechazado', tone: 'danger' },
  [TransactionStatus.ERROR]: { title: 'No pudimos procesar tu pago', tone: 'danger' },
  [TransactionStatus.VOIDED]: { title: 'El pago fue anulado', tone: 'danger' },
  [TransactionStatus.EXPIRED]: { title: 'El pago expiró', tone: 'danger' },
  [TransactionStatus.PENDING]: { title: 'Procesando tu pago…', tone: 'warning' },
};

// Shown once the polling window elapses without a final status
// (use-transaction-polling.ts's 'under-review' phase).
export const UNDER_REVIEW_COPY = 'Pago en verificación. Te avisaremos por correo.';

// TransactionView.delivery.status is the only source for this label — the
// status page never calls GET /deliveries/:id (specs/11-web-payment.md
// #decisions, "Final status").
export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  [DeliveryStatus.AWAITING_PAYMENT]: 'Esperando pago',
  [DeliveryStatus.READY_TO_SHIP]: 'Listo para envío',
  [DeliveryStatus.CANCELLED]: 'Cancelado',
};
