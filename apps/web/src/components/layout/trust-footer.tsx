import { ShieldCheck } from 'lucide-react';

export function TrustFooter() {
  return (
    <footer className="flex items-center justify-center gap-2 border-t border-border-subtle bg-surface py-4 text-sm text-text">
      <ShieldCheck className="size-4" aria-hidden="true" />
      <span>Pago seguro</span>
    </footer>
  );
}
