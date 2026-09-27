export const PRODUCT_IMAGE_WIDTHS = [320, 640, 960] as const;

/** Width of the file the API's `imageUrl` points at; also the `<img>` width and height. */
export const PRODUCT_IMAGE_SOURCE_WIDTH = 640;

// Covers the first row at every breakpoint (1, 2 or 3 columns).
export const EAGER_IMAGE_COUNT = 3;

export const PRODUCT_GRID_IMAGE_SIZES = '(min-width:1024px) 330px, (min-width:640px) 50vw, 100vw';
