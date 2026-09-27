import { GATEWAY_ERROR_MESSAGES } from '../checkout.constants';
import type { GatewayErrorReason } from '../hooks/use-card-tokenization';

export interface GatewayErrorProps {
  reason: GatewayErrorReason | null;
}

// Shown above 2b's "Continuar" on a tokenization failure; the button itself
// stays enabled so the customer can retry (see specs/07-web-checkout.md
// #ui-rules, "Gateway errors" row).
export function GatewayError({ reason }: GatewayErrorProps) {
  if (!reason) {
    return null;
  }

  return (
    <p role="alert" className="text-sm font-semibold text-danger">
      {GATEWAY_ERROR_MESSAGES[reason]}
    </p>
  );
}
