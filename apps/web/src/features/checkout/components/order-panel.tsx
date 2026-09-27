import type { ProductDetail } from '@checkout/shared/contracts';

import { Skeleton } from '@/components/ui/skeleton';
import { useGetProductQuery } from '@/features/catalog';

import { AmountBox } from './amount-box';

interface OrderPanelProps {
  productId: string;
  quantity: number;
}

function ProductSummary({ product, quantity }: { product?: ProductDetail; quantity: number }) {
  if (!product) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 shrink-0 rounded-card" />
        <Skeleton className="h-5 w-32" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <img
        src={product.imageUrl}
        alt={`${product.brand} ${product.name}`}
        width={64}
        height={64}
        loading="lazy"
        className="size-16 shrink-0 rounded-card border border-border bg-surface object-contain"
      />
      <div>
        <p className="font-heading text-lg font-bold text-text-strong">{product.name}</p>
        <p className="text-sm text-text">× {quantity}</p>
      </div>
    </div>
  );
}

// Desktop shows product + amount box in a full `surface-tint` panel; mobile
// collapses both into one line above the current sub-step (see
// specs/07-web-checkout.md#ui-rules, Order panel row).
export function OrderPanel({ productId, quantity }: OrderPanelProps) {
  const { data: product } = useGetProductQuery(productId);

  return (
    <>
      <div
        data-testid="order-panel-desktop"
        className="hidden flex-col gap-6 rounded-panel bg-surface-tint p-6 md:flex md:p-8"
      >
        <ProductSummary product={product} quantity={quantity} />
        <AmountBox productId={productId} quantity={quantity} />
      </div>
      <div
        data-testid="order-panel-mobile"
        className="flex items-center justify-between gap-3 border-b border-border-subtle pb-4 md:hidden"
      >
        <p className="min-w-0 truncate text-sm font-semibold text-text-strong">
          {product ? `${product.name} × ${quantity}` : 'Cargando…'}
        </p>
        <AmountBox productId={productId} quantity={quantity} compact />
      </div>
    </>
  );
}
