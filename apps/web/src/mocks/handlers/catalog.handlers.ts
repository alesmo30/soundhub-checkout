import { HttpResponse, http } from 'msw';
import type {
  ApiResponse,
  Paginated,
  ProductDetail,
  ProductSummary,
} from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import { products } from '../fixtures/products';
import { problem } from '../problem';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

function notFound() {
  return HttpResponse.json(problem(404, ErrorCode.PRODUCT_NOT_FOUND, 'Product not found'), {
    status: 404,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export const catalogHandlers = [
  http.get('*/api/v1/products', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? DEFAULT_PAGE);
    const limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const start = (page - 1) * limit;
    const totalItems = products.length;

    const body: Paginated<ProductSummary> = {
      data: products.slice(start, start + limit),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };

    return HttpResponse.json(body);
  }),

  http.get('*/api/v1/products/:id', ({ params }) => {
    const product = products.find((candidate) => candidate.id === params.id);

    if (!product) {
      return notFound();
    }

    const body: ApiResponse<ProductDetail> = { data: product };

    return HttpResponse.json(body);
  }),
];
