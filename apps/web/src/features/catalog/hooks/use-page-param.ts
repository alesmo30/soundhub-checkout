import type { To } from 'react-router';
import { useSearchParams } from 'react-router';

const PAGE_PARAM = 'page';
const POSITIVE_INTEGER = /^[1-9]\d*$/;

/** Current `?page`; anything that is not a positive integer reads as page 1. */
export function usePageParam(): number {
  const [searchParams] = useSearchParams();
  const value = searchParams.get(PAGE_PARAM);

  return value !== null && POSITIVE_INTEGER.test(value) ? Number(value) : 1;
}

/** Link target for a page; page 1 drops the param so `/` stays the canonical URL. */
export function toPage(page: number): To {
  return { search: page === 1 ? '' : `?${PAGE_PARAM}=${page}` };
}
