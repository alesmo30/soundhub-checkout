import { buildPaginationMeta } from './build-pagination-meta';

describe('buildPaginationMeta', () => {
  it('computes totalPages with Math.ceil for a partial last page', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 10, totalItems: 15 });

    expect(meta).toEqual({ page: 1, limit: 10, totalItems: 15, totalPages: 2 });
  });

  it('returns totalPages 0 when there are no items, instead of Infinity or NaN', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 10, totalItems: 0 });

    expect(meta.totalPages).toBe(0);
  });

  it('echoes back the requested page and limit even past the end', () => {
    const meta = buildPaginationMeta({ page: 3, limit: 10, totalItems: 15 });

    expect(meta).toEqual({ page: 3, limit: 10, totalItems: 15, totalPages: 2 });
  });
});
