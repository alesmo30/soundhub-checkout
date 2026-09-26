import type { ApiResponse, DeliveryView, ProblemDetails } from '@checkout/shared/contracts';

import { env } from '@/config/env';

import { deliveryFixture } from '../fixtures/delivery';

describe('deliveries handlers', () => {
  it('returns READY_TO_SHIP on GET /deliveries/:id', async () => {
    const response = await fetch(`${env.apiBaseUrl}/deliveries/${deliveryFixture.id}`);
    const body = (await response.json()) as ApiResponse<DeliveryView>;

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('READY_TO_SHIP');
  });

  it('returns 404 DELIVERY_NOT_FOUND for an unknown id', async () => {
    const response = await fetch(`${env.apiBaseUrl}/deliveries/does-not-exist`);
    const body = (await response.json()) as ProblemDetails;

    expect(response.status).toBe(404);
    expect(body.code).toBe('DELIVERY_NOT_FOUND');
  });
});
