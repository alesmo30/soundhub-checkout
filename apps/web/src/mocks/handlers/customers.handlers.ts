import { HttpResponse, http } from 'msw';
import type { ApiResponse, Customer, UpsertCustomerRequest } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import { customerFixture } from '../fixtures/customer';
import { problem } from '../problem';

export const customersHandlers = [
  http.post('*/api/v1/customers', async ({ request }) => {
    const payload = (await request.json()) as UpsertCustomerRequest;

    const body: ApiResponse<Customer> = {
      data: { id: customerFixture.id, ...payload },
    };

    return HttpResponse.json(body, { status: 201 });
  }),

  http.get('*/api/v1/customers/:id', ({ params }) => {
    if (params.id !== customerFixture.id) {
      return HttpResponse.json(problem(404, ErrorCode.CUSTOMER_NOT_FOUND, 'Customer not found'), {
        status: 404,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }

    const body: ApiResponse<Customer> = { data: customerFixture };

    return HttpResponse.json(body);
  }),
];
