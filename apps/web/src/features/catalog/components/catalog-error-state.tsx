import { CircleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { catalogErrorMessage } from '../lib/catalog-error-message';

interface CatalogErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

export function CatalogErrorState({ error, onRetry }: CatalogErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-6 text-center md:p-8"
    >
      <CircleAlert aria-hidden="true" strokeWidth={1.5} className="size-10 text-danger" />
      <p className="max-w-md text-base text-text-strong">{catalogErrorMessage(error)}</p>
      <Button onClick={onRetry}>Reintentar</Button>
    </div>
  );
}
