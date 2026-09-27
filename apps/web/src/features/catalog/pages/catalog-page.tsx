import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { useGetProductsQuery } from '../catalog.api';
import { CatalogErrorState } from '../components/catalog-error-state';
import { Pagination } from '../components/pagination';
import { ProductGrid, ProductGridSkeleton } from '../components/product-grid';
import { toPage, usePageParam } from '../hooks/use-page-param';

function CatalogMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-6 text-center text-base text-text-strong md:p-8">
      {children}
    </div>
  );
}

function CatalogContent() {
  const page = usePageParam();
  // currentData (not data) so a page change shows the skeleton instead of the
  // previous page's cards.
  const { currentData, error, isError, refetch } = useGetProductsQuery({ page });

  if (isError) {
    return (
      <CatalogErrorState
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (!currentData) {
    return <ProductGridSkeleton />;
  }

  const { data: products, meta } = currentData;

  if (meta.totalItems === 0) {
    return (
      <CatalogMessage>
        <p>Aún no hay productos disponibles.</p>
      </CatalogMessage>
    );
  }

  if (products.length === 0) {
    return (
      <CatalogMessage>
        <p>Esta página no tiene productos.</p>
        <Link
          to={toPage(1)}
          className="font-semibold text-brand-forest underline-offset-4 hover:underline"
        >
          Ir a la página 1
        </Link>
      </CatalogMessage>
    );
  }

  return (
    <>
      <ProductGrid products={products} />
      <Pagination page={page} totalPages={meta.totalPages} />
    </>
  );
}

export function CatalogPage() {
  return (
    <section className="flex flex-col gap-6 py-6 md:py-8">
      <h1 className="font-heading text-2xl font-bold text-text-strong">Audífonos</h1>
      <CatalogContent />
    </section>
  );
}
