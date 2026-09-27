import type { ProductSummary } from '@checkout/shared/contracts';
import { Link } from 'react-router';

import { Card } from '@/components/ui/card';
import { formatCop } from '@/lib/money';

import { PRODUCT_GRID_IMAGE_SIZES } from '../catalog.constants';
import { ProductImage } from './product-image';
import { StockBadge } from './stock-badge';

interface ProductCardProps {
  product: ProductSummary;
  eagerImage: boolean;
}

export function ProductCard({ product, eagerImage }: ProductCardProps) {
  const { id, brand, name, imageUrl, priceInCents, stockAvailable } = product;

  return (
    <Link to={`/products/${encodeURIComponent(id)}`} className="group block h-full rounded-card">
      <Card className="h-full gap-0 overflow-hidden py-0 transition-colors duration-200 ease-out group-hover:border-ink">
        <ProductImage
          imageUrl={imageUrl}
          alt={`${brand} ${name}`}
          sizes={PRODUCT_GRID_IMAGE_SIZES}
          eager={eagerImage}
        />
        <div className="flex flex-1 flex-col gap-1 border-t border-border-subtle p-4">
          <p className="text-xs font-bold text-text uppercase">{brand}</p>
          <h2 className="font-heading text-lg font-bold break-words text-text-strong">{name}</h2>
          <p className="mt-auto pt-2 font-heading text-xl font-bold text-ink">
            {formatCop(priceInCents)}
          </p>
          <StockBadge stockAvailable={stockAvailable} />
        </div>
      </Card>
    </Link>
  );
}
