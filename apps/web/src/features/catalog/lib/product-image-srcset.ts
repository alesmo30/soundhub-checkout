import { PRODUCT_IMAGE_SOURCE_WIDTH, PRODUCT_IMAGE_WIDTHS } from '../catalog.constants';

const SOURCE_SUFFIX = `-${PRODUCT_IMAGE_SOURCE_WIDTH}.webp`;

/**
 * Derives the 320/640/960 `srcset` from the `-640.webp` URL. Returns
 * `undefined` for any other URL, so the image falls back to its `src`.
 */
export function productImageSrcSet(imageUrl: string): string | undefined {
  if (!imageUrl.endsWith(SOURCE_SUFFIX)) {
    return undefined;
  }

  const base = imageUrl.slice(0, -SOURCE_SUFFIX.length);

  return PRODUCT_IMAGE_WIDTHS.map((width) => `${base}-${width}.webp ${width}w`).join(', ');
}
