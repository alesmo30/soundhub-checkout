import type { ApiResponse, Quote } from '@checkout/shared/contracts';

import { env } from '@/config/env';

describe('quotes handlers', () => {
  it('returns the static quote example with a total of 392046000', async () => {
    const response = await fetch(
      `${env.apiBaseUrl}/quotes?productId=x&quantity=2&municipalityCode=05001`,
    );
    const body = (await response.json()) as ApiResponse<Quote>;

    expect(response.status).toBe(200);
    expect(body.data.totalInCents).toBe(392_046_000);
  });
});
