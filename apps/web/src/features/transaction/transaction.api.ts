import type { ApiResponse, TransactionView } from '@checkout/shared/contracts';

import { api } from '@/services/api';

export interface GetTransactionResult {
  view: TransactionView;
  retryAfterMs: number | null;
}

const SECONDS_TO_MS = 1000;

function toRetryAfterMs(retryAfter: string | null | undefined): number | null {
  return retryAfter ? Number(retryAfter) * SECONDS_TO_MS : null;
}

export const transactionApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getTransaction: builder.query<GetTransactionResult, string>({
      query: (id) => `transactions/${id}`,
      transformResponse: (response: ApiResponse<TransactionView>, meta) => ({
        view: response.data,
        retryAfterMs: toRetryAfterMs(meta?.response?.headers.get('Retry-After')),
      }),
    }),
  }),
});

export const { useGetTransactionQuery, useLazyGetTransactionQuery } = transactionApi;
