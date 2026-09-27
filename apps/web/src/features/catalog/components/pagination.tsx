import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

import { toPage } from '../hooks/use-page-param';

interface PaginationProps {
  page: number;
  totalPages: number;
}

interface PageLinkProps {
  page: number;
  isCurrent?: boolean;
  children: ReactNode;
}

function PageLink({ page, isCurrent = false, children }: PageLinkProps) {
  return (
    <Link
      to={toPage(page)}
      aria-current={isCurrent ? 'page' : undefined}
      onClick={() => window.scrollTo({ top: 0 })}
      className={cn(
        buttonVariants({ variant: isCurrent ? 'primary' : 'secondary', size: 'compact' }),
        'min-w-11',
      )}
    >
      {children}
    </Link>
  );
}

function DisabledStep({ children }: { children: ReactNode }) {
  return (
    <span
      aria-disabled="true"
      className={cn(buttonVariants({ variant: 'secondary', size: 'compact' }), 'opacity-40')}
    >
      {children}
    </span>
  );
}

export function Pagination({ page, totalPages }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <nav aria-label="Paginación">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          {page > 1 ? (
            <PageLink page={page - 1}>Anterior</PageLink>
          ) : (
            <DisabledStep>Anterior</DisabledStep>
          )}
        </li>
        {pages.map((number) => (
          <li key={number}>
            <PageLink page={number} isCurrent={number === page}>
              {number}
            </PageLink>
          </li>
        ))}
        <li>
          {page < totalPages ? (
            <PageLink page={page + 1}>Siguiente</PageLink>
          ) : (
            <DisabledStep>Siguiente</DisabledStep>
          )}
        </li>
      </ul>
    </nav>
  );
}
