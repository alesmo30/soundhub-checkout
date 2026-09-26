import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { REQUEST_ID_HEADER, type ProblemDetails } from '@checkout/shared/contracts';
import type { ErrorCode } from '@checkout/shared/enums';

import { env } from '@/config/env';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: env.apiBaseUrl,
    prepareHeaders: (headers) => {
      headers.set(REQUEST_ID_HEADER, crypto.randomUUID());

      return headers;
    },
  }),
  tagTypes: ['Product', 'Quote', 'Customer'],
  endpoints: () => ({}),
});

export function isProblemDetails(error: unknown): error is { status: number; data: ProblemDetails } {
  if (typeof error !== 'object' || error === null || !('status' in error) || !('data' in error)) {
    return false;
  }

  if (typeof error.status !== 'number') {
    return false;
  }

  const { data } = error;

  return typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string';
}

export function getErrorCode(error: unknown): ErrorCode | null {
  return isProblemDetails(error) ? error.data.code : null;
}
