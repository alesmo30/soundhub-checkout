import type {
  ApiResponse,
  CreateTransactionRequest,
  Customer,
  Department,
  Municipality,
  Quote,
  QuoteQuery,
  TransactionCreated,
  UpsertCustomerRequest,
} from '@checkout/shared/contracts';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from '@checkout/shared/contracts';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

import { api } from '@/services/api';
import { fetchAcceptanceTokens, type AcceptanceTerms } from '@/services/payment-gateway';

function toQueryError(error: unknown): FetchBaseQueryError {
  return {
    status: 'CUSTOM_ERROR',
    error: error instanceof Error ? error.message : 'Failed to fetch acceptance tokens',
  };
}

interface CreateTransactionArgs {
  idempotencyKey: string;
  body: CreateTransactionRequest;
}

interface CreateTransactionResult {
  transaction: TransactionCreated;
  replayed: boolean;
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
    upsertCustomer: builder.mutation<Customer, UpsertCustomerRequest>({
      query: (body) => ({ url: 'customers', method: 'POST', body }),
      transformResponse: (response: ApiResponse<Customer>) => response.data,
    }),
    createTransaction: builder.mutation<CreateTransactionResult, CreateTransactionArgs>({
      query: ({ idempotencyKey, body }) => ({
        url: 'transactions',
        method: 'POST',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      }),
      transformResponse: (response: ApiResponse<TransactionCreated>, meta) => ({
        transaction: response.data,
        replayed: meta?.response?.headers.get(IDEMPOTENT_REPLAYED_HEADER) === 'true',
      }),
    }),
  }),
});

export const {
  useGetDepartmentsQuery,
  useGetMunicipalitiesQuery,
  useGetQuoteQuery,
  useGetAcceptanceTokensQuery,
  useUpsertCustomerMutation,
  useCreateTransactionMutation,
} = checkoutApi;
