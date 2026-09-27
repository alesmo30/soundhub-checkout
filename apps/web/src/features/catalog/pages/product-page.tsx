import { CreditCard } from 'lucide-react';
import { useParams } from 'react-router';
import type { ProductDetail } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckoutDialog,
  selectCheckoutProductId,
  selectQuantityFor,
  setQuantity,
  startCheckout,
} from '@/features/checkout';
import { formatCop } from '@/lib/money';
import { getErrorCode } from '@/services/api';

import { useGetProductQuery } from '../catalog.api';
import { PRODUCT_DETAIL_IMAGE_SIZES } from '../catalog.constants';
import { CatalogErrorState } from '../components/catalog-error-state';
import { ProductImage } from '../components/product-image';
import { ProductNotFound } from '../components/product-not-found';
import { QuantitySelector } from '../components/quantity-selector';

const MIN_QUANTITY = 1;

// A malformed id (400) means the same to the customer as an unknown one (404).
const NOT_FOUND_CODES: ReadonlySet<ErrorCode | null> = new Set([
  ErrorCode.PRODUCT_NOT_FOUND,
  ErrorCode.VALIDATION_ERROR,
]);

const COLUMNS = 'grid gap-6 md:grid-cols-2 md:items-start md:gap-8';

function stockLabel(stockAvailable: number): string {
  if (stockAvailable <= 0) {
    return 'Agotado';
  }

  return stockAvailable === 1 ? '1 unidad disponible' : `${stockAvailable} unidades disponibles`;
}

// The saved quantity may predate a stock drop, so it is clamped to what can be bought now.
function useProductQuantity({ id, maxPurchaseQuantity }: ProductDetail) {
  const dispatch = useAppDispatch();
  const saved = useAppSelector((state) => selectQuantityFor(state, id));
  const quantity = Math.max(MIN_QUANTITY, Math.min(saved, maxPurchaseQuantity));

  return {
    quantity,
    changeQuantity: (next: number) => dispatch(setQuantity({ productId: id, quantity: next })),
    checkout: () => dispatch(startCheckout({ productId: id, quantity })),
  };
}

function ProductDetails({ product }: { product: ProductDetail }) {
  const { quantity, changeQuantity, checkout } = useProductQuantity(product);
  // A checkout left open on another product must not pop up over this one.
  const isOwnCheckout = useAppSelector(selectCheckoutProductId) === product.id;
  const { brand, name, description, imageUrl, priceInCents, vatIncludedInCents } = product;
  const isOutOfStock = product.stockAvailable <= 0;

  return (
    <div className={COLUMNS}>
      <ProductImage
        key={imageUrl}
        imageUrl={imageUrl}
        alt={`${brand} ${name}`}
        sizes={PRODUCT_DETAIL_IMAGE_SIZES}
        eager
        highPriority
        className="rounded-card border border-border"
      />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-text uppercase">{brand}</p>
          <h1 className="font-heading text-2xl font-bold break-words text-text-strong">{name}</h1>
          <p className="text-base text-text">{description}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-heading text-4xl font-bold text-ink">{formatCop(priceInCents)}</p>
          <p className="text-sm text-text">IVA incluido: {formatCop(vatIncludedInCents)}</p>
          <p
            className={
              isOutOfStock ? 'font-semibold text-danger' : 'font-semibold text-brand-forest'
            }
          >
            {stockLabel(product.stockAvailable)}
          </p>
        </div>
        <QuantitySelector
          value={quantity}
          stockAvailable={product.stockAvailable}
          maxPurchaseQuantity={product.maxPurchaseQuantity}
          onChange={changeQuantity}
        />
        <Button
          className="w-full md:w-auto md:self-start"
          disabled={isOutOfStock}
          onClick={checkout}
        >
          <CreditCard aria-hidden="true" strokeWidth={1.5} />
          Pagar con tarjeta de crédito
        </Button>
      </div>
      {isOwnCheckout && <CheckoutDialog />}
    </div>
  );
}

function ProductPageSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Cargando producto…
      </p>
      <div aria-hidden="true" className={COLUMNS}>
        <Skeleton className="aspect-square rounded-card" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 w-36 rounded-full" />
          <Skeleton className="h-14 w-full rounded-full md:w-72" />
        </div>
      </div>
    </div>
  );
}

function ProductContent({ id }: { id: string }) {
  // currentData (not data) so moving to another product shows the skeleton
  // instead of the previous product.
  const { currentData, error, isError, refetch } = useGetProductQuery(id);

  if (isError) {
    return NOT_FOUND_CODES.has(getErrorCode(error)) ? (
      <ProductNotFound />
    ) : (
      <CatalogErrorState
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return currentData ? <ProductDetails product={currentData} /> : <ProductPageSkeleton />;
}

export function ProductPage() {
  const { id = '' } = useParams<{ id: string }>();

  return (
    <section className="py-6 md:py-8">
      <ProductContent id={id} />
    </section>
  );
}
