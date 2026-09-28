import { HttpResponse, http } from 'msw';
import type {
  ApiResponse,
  CreateTransactionRequest,
  TransactionCreated,
  TransactionView,
} from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import {
  transactionCreatedDeclinedProgressingFixture,
  transactionCreatedProgressingFixture,
  transactionDeclinedProgressingFixture,
  transactionDeclinedProgressingId,
  transactionDeclinedProgressingPendingFixture,
  transactionProgressingApprovedFixture,
  transactionProgressingId,
  transactionProgressingPendingFixture,
  transactionViewFixturesById,
} from '../fixtures/transaction';
import { problem } from '../problem';

// A "progressing" fixture answers PENDING (with Retry-After) on its first
// two GETs, then its final status. The counters live here, module-scoped,
// and are reset by resetTransactionsHandlersState (called from
// src/test/setup.ts's afterEach) so one test's polling never leaks into
// the next.
const PROGRESSING_PENDING_RESPONSES = 2;

let progressingCallCount = 0;
let declinedProgressingCallCount = 0;

export function resetTransactionsHandlersState(): void {
  progressingCallCount = 0;
  declinedProgressingCallCount = 0;
}

function progressingResponse(
  callCount: number,
  pendingView: TransactionView,
  finalView: TransactionView,
): Response {
  const body: ApiResponse<TransactionView> = {
    data: callCount < PROGRESSING_PENDING_RESPONSES ? pendingView : finalView,
  };

  return HttpResponse.json(
    body,
    callCount < PROGRESSING_PENDING_RESPONSES ? { headers: { 'Retry-After': '2' } } : undefined,
  );
}

export const transactionsHandlers = [
  http.post('*/api/v1/transactions', async ({ request }) => {
    const body = (await request.json()) as CreateTransactionRequest;
    const created = body.payment.cardToken.endsWith('1111')
      ? transactionCreatedDeclinedProgressingFixture
      : transactionCreatedProgressingFixture;

    const responseBody: ApiResponse<TransactionCreated> = { data: created };

    return HttpResponse.json(responseBody, {
      status: 201,
      headers: { Location: `/api/v1/transactions/${created.id}` },
    });
  }),

  http.get('*/api/v1/transactions/:id', ({ params }) => {
    const id = params.id as string;

    if (id === transactionProgressingId) {
      return progressingResponse(
        progressingCallCount++,
        transactionProgressingPendingFixture,
        transactionProgressingApprovedFixture,
      );
    }

    if (id === transactionDeclinedProgressingId) {
      return progressingResponse(
        declinedProgressingCallCount++,
        transactionDeclinedProgressingPendingFixture,
        transactionDeclinedProgressingFixture,
      );
    }

    const fixture = transactionViewFixturesById[id];

    if (!fixture) {
      return HttpResponse.json(
        problem(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found'),
        { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
      );
    }

    const body: ApiResponse<TransactionView> = { data: fixture };

    return HttpResponse.json(body);
  }),
];
