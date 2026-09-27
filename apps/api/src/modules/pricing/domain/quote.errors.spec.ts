import { ErrorCode } from '@checkout/shared/enums';

import { outOfStock, quoteMunicipalityNotFound, quoteProductNotFound } from './quote.errors';

describe('quoteProductNotFound', () => {
  it('builds an UNPROCESSABLE domain error', () => {
    const error = quoteProductNotFound();

    expect(error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
    expect(error.kind).toBe('UNPROCESSABLE');
  });
});

describe('quoteMunicipalityNotFound', () => {
  it('builds an UNPROCESSABLE domain error', () => {
    const error = quoteMunicipalityNotFound();

    expect(error.code).toBe(ErrorCode.MUNICIPALITY_NOT_FOUND);
    expect(error.kind).toBe('UNPROCESSABLE');
  });
});

describe('outOfStock', () => {
  it('builds a CONFLICT domain error carrying the available quantity', () => {
    const error = outOfStock(5);

    expect(error.code).toBe(ErrorCode.OUT_OF_STOCK);
    expect(error.kind).toBe('CONFLICT');
    expect(error.detail).toContain('Only 5 units available');
  });
});
