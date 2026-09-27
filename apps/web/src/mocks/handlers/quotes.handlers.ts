import { HttpResponse, http } from 'msw';
import type { ApiResponse, Quote } from '@checkout/shared/contracts';

import { quoteFixture } from '../fixtures/quote';

export const quotesHandlers = [
  http.get('*/api/v1/quotes', () => {
    const body: ApiResponse<Quote> = { data: quoteFixture };

    return HttpResponse.json(body);
  }),
];
