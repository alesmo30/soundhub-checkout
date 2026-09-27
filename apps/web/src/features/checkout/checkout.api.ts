import type {
  ApiResponse,
  Department,
  Municipality,
  Quote,
  QuoteQuery,
} from '@checkout/shared/contracts';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

import { api } from '@/services/api';
import { fetchAcceptanceTokens, type AcceptanceTerms } from '@/services/payment-gateway';

function toQueryError(error: unknown): FetchBaseQueryError {
  return {
    status: 'CUSTOM_ERROR',
    error: error instanceof Error ? error.message : 'Failed to fetch acceptance tokens',
  };
}

export const checkoutApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDepartments: builder.query<Department[], void>({
      query: () => 'locations/departments',
      transformResponse: (response: ApiResponse<Department[]>) => response.data,
    }),
    getMunicipalities: builder.query<Municipality[], string>({
      query: (departmentCode) =>
        `locations/departments/${encodeURIComponent(departmentCode)}/municipalities`,
      transformResponse: (response: ApiResponse<Municipality[]>) => response.data,
    }),
    getQuote: builder.query<Quote, QuoteQuery>({
      query: ({ productId, quantity, municipalityCode }) => ({
        url: 'quotes',
        params: { productId, quantity, municipalityCode },
      }),
      transformResponse: (response: ApiResponse<Quote>) => response.data,
      providesTags: [{ type: 'Quote' }],
    }),
    getAcceptanceTokens: builder.query<AcceptanceTerms, void>({
      queryFn: async () => {
        try {
          return { data: await fetchAcceptanceTokens() };
        } catch (error) {
          return { error: toQueryError(error) };
        }
      },
    }),
  }),
});

export const {
  useGetDepartmentsQuery,
  useGetMunicipalitiesQuery,
  useGetQuoteQuery,
  useGetAcceptanceTokensQuery,
} = checkoutApi;
