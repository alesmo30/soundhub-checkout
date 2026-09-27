import { productImageSrcSet } from './product-image-srcset';

describe('productImageSrcSet', () => {
  it('derives the 320/640/960 widths from a relative -640.webp URL', () => {
    expect(productImageSrcSet('/images/products/HP-ATH-M50X-640.webp')).toBe(
      '/images/products/HP-ATH-M50X-320.webp 320w, ' +
        '/images/products/HP-ATH-M50X-640.webp 640w, ' +
        '/images/products/HP-ATH-M50X-960.webp 960w',
    );
  });

  it('keeps the origin of an absolute URL', () => {
    expect(productImageSrcSet('https://cdn.example.test/p/HP-ATH-M50X-640.webp')).toContain(
      'https://cdn.example.test/p/HP-ATH-M50X-960.webp 960w',
    );
  });

  it.each(['/images/products/HP-ATH-M50X-320.webp', '/images/products/HP-ATH-M50X.jpg'])(
    'returns undefined for %s so the image falls back to its src',
    (imageUrl) => {
      expect(productImageSrcSet(imageUrl)).toBeUndefined();
    },
  );
});
