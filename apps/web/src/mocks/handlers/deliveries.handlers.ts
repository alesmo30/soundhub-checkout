import { HttpResponse, http } from 'msw';
import type { ApiResponse, DeliveryView } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import { deliveryFixture } from '../fixtures/delivery';
import { problem } from '../problem';

export const deliveriesHandlers = [
  http.get('*/api/v1/deliveries/:id', ({ params }) => {
    if (params.id !== deliveryFixture.id) {
      return HttpResponse.json(problem(404, ErrorCode.DELIVERY_NOT_FOUND, 'Delivery not found'), {
        status: 404,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }

    const body: ApiResponse<DeliveryView> = { data: deliveryFixture };

    return HttpResponse.json(body);
  }),
];
