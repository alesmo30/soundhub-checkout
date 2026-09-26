import type { Paginated, ProductSummary } from '@checkout/shared/contracts';

import { api } from '@/services/api';

// Temporary endpoint so step 9's MSW wiring is visible on screen. web 02
// replaces this whole file with the real catalog feature.
const tempCatalogApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getTempProducts: builder.query<Paginated<ProductSummary>, void>({
      query: () => 'products',
    }),
  }),
});

export const { useGetTempProductsQuery } = tempCatalogApi;
