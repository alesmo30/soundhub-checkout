// Mirrors apps/web/src/lib/money.ts's formatter so emails and the web app
// never disagree on how a COP amount reads.
const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(cents: number): string {
  return COP_FORMATTER.format(cents / 100);
}
