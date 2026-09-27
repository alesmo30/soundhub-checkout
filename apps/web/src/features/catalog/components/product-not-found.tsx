import { SearchX } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

export function ProductNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-6 text-center md:p-8">
      <SearchX aria-hidden="true" strokeWidth={1.5} className="size-10 text-text" />
      <h1 className="font-heading text-2xl font-bold text-text-strong">
        No encontramos este producto
      </h1>
      <p className="max-w-md text-base text-text">
        Puede que el enlace esté mal escrito o que el producto ya no esté disponible.
      </p>
      <Button asChild>
        <Link to="/">Ver catálogo</Link>
      </Button>
    </div>
  );
}
