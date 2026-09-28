import type { TransactionView } from '@checkout/shared/contracts';

export interface StatusActionsProps {
  view: TransactionView;
}

// Empty slot for now: "Volver al producto" and, on a failed status,
// "Intentar con otra tarjeta" land in step 9
// (specs/11-web-payment.md#implementation-plan, step 9 "Status actions").
// Rendered from transaction-status-page.tsx already, on the 'final' phase
// only, so step 9 only has to fill this component's body.
export function StatusActions({ view }: StatusActionsProps) {
  void view;

  return null;
}
