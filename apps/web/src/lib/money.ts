import type { Cents } from '@checkout/shared/contracts';

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(cents: Cents): string {
  return COP_FORMATTER.format(cents / 100);
}
