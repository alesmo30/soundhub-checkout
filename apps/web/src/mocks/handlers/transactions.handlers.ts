import { HttpResponse, http } from 'msw';
import type { ApiResponse, TransactionCreated, TransactionView } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import { transactionCreatedFixture, transactionViewFixture } from '../fixtures/transaction';
import { problem } from '../problem';

export const transactionsHandlers = [
  http.post('*/api/v1/transactions', () => {
    const body: ApiResponse<TransactionCreated> = { data: transactionCreatedFixture };

    return HttpResponse.json(body, {
      status: 201,
      headers: { Location: `/api/v1/transactions/${transactionCreatedFixture.id}` },
    });
  }),

  http.get('*/api/v1/transactions/:id', ({ params }) => {
    if (params.id !== transactionViewFixture.id) {
      return HttpResponse.json(
        problem(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found'),
        { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
      );
    }

    const body: ApiResponse<TransactionView> = { data: transactionViewFixture };

    return HttpResponse.json(body);
  }),
];
