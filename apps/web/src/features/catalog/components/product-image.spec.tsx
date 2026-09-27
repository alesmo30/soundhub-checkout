import { fireEvent, render, screen } from '@testing-library/react';

import { ProductImage } from './product-image';

const IMAGE_URL = '/images/products/HP-ATH-M50X-640.webp';

function renderImage(props: { eager?: boolean; highPriority?: boolean; imageUrl?: string } = {}) {
  const { container } = render(
    <ProductImage imageUrl={IMAGE_URL} alt="Audio-Technica ATH-M50x" sizes="100vw" {...props} />,
  );
  const skeleton = () => container.querySelector('[data-slot="skeleton"]');

  return { image: screen.getByRole('img', { name: 'Audio-Technica ATH-M50x' }), skeleton };
}

describe('ProductImage', () => {
  it('renders the 640 file with its srcset, sizes and explicit dimensions', () => {
    const { image } = renderImage();

    expect(image).toHaveAttribute('src', IMAGE_URL);
    expect(image.getAttribute('srcset')).toContain('HP-ATH-M50X-960.webp 960w');
    expect(image).toHaveAttribute('sizes', '100vw');
    expect(image).toHaveAttribute('width', '640');
    expect(image).toHaveAttribute('height', '640');
  });

  it('omits srcset when the URL is not a -640.webp file', () => {
    const { image } = renderImage({ imageUrl: '/images/other.jpg' });

    expect(image).toHaveAttribute('src', '/images/other.jpg');
    expect(image).not.toHaveAttribute('srcset');
  });

  it('is lazy with no fetch priority by default', () => {
    const { image } = renderImage();

    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).not.toHaveAttribute('fetchpriority');
  });

  it('can load eagerly with high priority, as the detail image does', () => {
    const { image } = renderImage({ eager: true, highPriority: true });

    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
  });

  it('shows a skeleton until the image loads', () => {
    const { image, skeleton } = renderImage();

    expect(skeleton()).toBeInTheDocument();

    fireEvent.load(image);

    expect(skeleton()).not.toBeInTheDocument();
  });

  it('hides the skeleton when the image fails, leaving the alt text', () => {
    const { image, skeleton } = renderImage();

    fireEvent.error(image);

    expect(skeleton()).not.toBeInTheDocument();
  });
});
