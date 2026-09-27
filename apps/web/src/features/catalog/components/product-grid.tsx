import { PAGE_SIZE_DEFAULT } from '@checkout/shared/constants';
import type { ProductSummary } from '@checkout/shared/contracts';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { EAGER_IMAGE_COUNT } from '../catalog.constants';
import { ProductCard } from './product-card';

const GRID_CLASSES = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';

interface ProductGridProps {
  products: ProductSummary[];
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <ul className={GRID_CLASSES}>
      {products.map((product, index) => (
        <li key={product.id} className="min-w-0">
          <ProductCard product={product} eagerImage={index < EAGER_IMAGE_COUNT} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Cargando productos…
      </p>
      <ul aria-hidden="true" className={GRID_CLASSES}>
        {Array.from({ length: PAGE_SIZE_DEFAULT }, (_, index) => (
          <li key={index} className="min-w-0">
            <Card className="gap-0 overflow-hidden py-0">
              <Skeleton className="aspect-square rounded-none" />
              <div className="flex flex-col gap-2 border-t border-border-subtle p-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
