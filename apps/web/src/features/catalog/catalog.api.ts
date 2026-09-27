import { PAGE_SIZE_DEFAULT } from '@checkout/shared/constants';
import type {
  ApiResponse,
  Paginated,
  ProductDetail,
  ProductSummary,
} from '@checkout/shared/contracts';

import { api } from '@/services/api';

const PRODUCT_LIST_TAG = { type: 'Product', id: 'LIST' } as const;

export const catalogApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query<Paginated<ProductSummary>, { page: number }>({
      query: ({ page }) => ({ url: 'products', params: { page, limit: PAGE_SIZE_DEFAULT } }),
      providesTags: (result) => [
        ...(result?.data.map(({ id }) => ({ type: 'Product' as const, id })) ?? []),
        PRODUCT_LIST_TAG,
      ],
    }),
    getProduct: builder.query<ProductDetail, string>({
      query: (id) => `products/${encodeURIComponent(id)}`,
      transformResponse: (response: ApiResponse<ProductDetail>) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),
  }),
});

export const { useGetProductsQuery, useGetProductQuery } = catalogApi;

// Dispatched after a payment finishes so the product page and the list show
// the stock left after the purchase.
export const invalidateProduct = (productId: string) =>
  api.util.invalidateTags([{ type: 'Product', id: productId }, PRODUCT_LIST_TAG]);
