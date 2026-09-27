import { useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

import { PRODUCT_IMAGE_SOURCE_WIDTH } from '../catalog.constants';
import { productImageSrcSet } from '../lib/product-image-srcset';

interface ProductImageProps {
  imageUrl: string;
  alt: string;
  sizes: string;
  eager?: boolean;
  highPriority?: boolean;
  className?: string;
}

export function ProductImage({
  imageUrl,
  alt,
  sizes,
  eager = false,
  highPriority = false,
  className,
}: ProductImageProps) {
  // A failed load also clears the skeleton so the alt text shows instead of a
  // placeholder that pulses forever.
  const [isSettled, setIsSettled] = useState(false);
  const settle = () => setIsSettled(true);

  return (
    <div className={cn('relative aspect-square overflow-hidden bg-surface', className)}>
      {isSettled ? null : <Skeleton aria-hidden="true" className="absolute inset-0 rounded-none" />}
      <img
        src={imageUrl}
        srcSet={productImageSrcSet(imageUrl)}
        sizes={sizes}
        alt={alt}
        width={PRODUCT_IMAGE_SOURCE_WIDTH}
        height={PRODUCT_IMAGE_SOURCE_WIDTH}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={highPriority ? 'high' : undefined}
        onLoad={settle}
        onError={settle}
        className={cn(
          'size-full object-contain transition-opacity duration-200 ease-out',
          isSettled ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
