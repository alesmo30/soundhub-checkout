import type { PaginationMeta } from '@checkout/shared/contracts';

interface BuildPaginationMetaInput {
  readonly page: number;
  readonly limit: number;
  readonly totalItems: number;
}

export function buildPaginationMeta({
  page,
  limit,
  totalItems,
}: BuildPaginationMetaInput): PaginationMeta {
  return {
    page,
    limit,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
  };
}
