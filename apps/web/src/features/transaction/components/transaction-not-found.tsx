import { SearchX } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

// Mirrors product-not-found.tsx's layout for an unknown or malformed
// transaction id (404 or 400 from GET /transactions/:id — see
// use-transaction-polling.ts's 'not-found' phase).
export function TransactionNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-6 text-center md:p-8">
      <SearchX aria-hidden="true" strokeWidth={1.5} className="size-10 text-text" />
      <h1 className="font-heading text-2xl font-bold text-text-strong">No encontramos este pago</h1>
      <p className="max-w-md text-base text-text">
        Puede que el enlace esté mal escrito o que el pago ya no exista.
      </p>
      <Button asChild>
        <Link to="/">Ver catálogo</Link>
      </Button>
    </div>
  );
}
