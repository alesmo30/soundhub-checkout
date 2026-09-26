import { CURRENCY } from '../constants';
import type { ErrorCode } from '../enums';

export type Cents = number;
export type Currency = typeof CURRENCY;

export interface ApiResponse<T> {
  data: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail: string;
  traceId: string;
  errors?: FieldError[];
}
