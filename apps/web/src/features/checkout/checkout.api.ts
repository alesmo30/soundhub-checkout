import type {
  ApiResponse,
  Department,
  Municipality,
  Quote,
  QuoteQuery,
} from '@checkout/shared/contracts';

import { api } from '@/services/api';

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
  }),
});

export const { useGetDepartmentsQuery, useGetMunicipalitiesQuery, useGetQuoteQuery } = checkoutApi;
