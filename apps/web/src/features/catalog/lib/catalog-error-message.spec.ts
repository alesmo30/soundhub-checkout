import { catalogErrorMessage } from './catalog-error-message';

const GENERIC = 'No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.';

describe('catalogErrorMessage', () => {
  it('asks the customer to wait when the API rate-limits', () => {
    expect(catalogErrorMessage({ status: 429, data: { code: 'RATE_LIMITED' } })).toBe(
      'Hiciste muchas solicitudes seguidas. Espera un momento e inténtalo de nuevo.',
    );
  });

  it.each([
    ['another error code', { status: 500, data: { code: 'INTERNAL_ERROR' } }],
    ['a network error', { status: 'FETCH_ERROR', error: 'Failed to fetch' }],
    ['no error at all', undefined],
  ])('falls back to the generic message for %s', (_label, error) => {
    expect(catalogErrorMessage(error)).toBe(GENERIC);
  });
});
