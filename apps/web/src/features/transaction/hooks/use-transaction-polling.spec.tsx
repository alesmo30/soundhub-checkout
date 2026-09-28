import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { HttpResponse, http } from 'msw';

import { makeStore } from '@/app/store';
import { server } from '@/mocks/server';
import {
  transactionApprovedFixture,
  transactionDeclinedProgressingId,
  transactionPendingFixture,
  transactionProgressingId,
} from '@/mocks/fixtures/transaction';
import { TransactionStatus } from '@checkout/shared/enums';

import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../transaction.constants';
import { useTransactionPolling } from './use-transaction-polling';

const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

function setup(id: string) {
  const store = makeStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return renderHook((props: { id: string }) => useTransactionPolling(props.id), {
    wrapper,
    initialProps: { id },
  });
}

// Real MSW round trips resolve through real promise chains, not fake
// timers; advanceTimersByTimeAsync flushes those microtasks between each
// fake-timer tick, which is what lets the two run together here.
async function tick(ms: number): Promise<void> {
  await act(() => jest.advanceTimersByTimeAsync(ms));
}

describe('useTransactionPolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('moves PENDING to APPROVED on the progressing id, requesting every 2s', async () => {
    const { result } = setup(transactionProgressingId);

    await tick(50);
    expect(result.current.phase).toBe('pending');

    await tick(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe('pending');

    await tick(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe('final');
    expect(result.current.phase === 'final' && result.current.view.status).toBe(
      TransactionStatus.APPROVED,
    );
  });

  it('moves PENDING to DECLINED on the declined-progressing id', async () => {
    const { result } = setup(transactionDeclinedProgressingId);

    await tick(50);
    expect(result.current.phase).toBe('pending');

    await tick(POLL_INTERVAL_MS);
    await tick(POLL_INTERVAL_MS);

    expect(result.current.phase).toBe('final');
    expect(result.current.phase === 'final' && result.current.view.status).toBe(
      TransactionStatus.DECLINED,
    );
  });

  it('waits the response Retry-After duration (5s) before the next request', async () => {
    const id = transactionPendingFixture.id;
    let calls = 0;

    server.use(
      http.get(`*/api/v1/transactions/${id}`, () => {
        calls += 1;

        if (calls === 1) {
          return HttpResponse.json(
            { data: transactionPendingFixture },
            { headers: { 'Retry-After': '5' } },
          );
        }

        return HttpResponse.json({ data: { ...transactionApprovedFixture, id } });
      }),
    );

    const { result } = setup(id);

    await tick(50);
    expect(result.current.phase).toBe('pending');
    expect(calls).toBe(1);

    await tick(4000);
    expect(calls).toBe(1);

    await tick(1000);
    expect(calls).toBe(2);
    expect(result.current.phase).toBe('final');
  });

  it('ignores a transient 504 in the middle and keeps polling at the normal interval', async () => {
    const id = transactionPendingFixture.id;
    let calls = 0;

    server.use(
      http.get(`*/api/v1/transactions/${id}`, () => {
        calls += 1;

        if (calls === 2) {
          return new HttpResponse(null, { status: 504 });
        }

        if (calls === 3) {
          return HttpResponse.json({ data: { ...transactionApprovedFixture, id } });
        }

        return HttpResponse.json({ data: transactionPendingFixture });
      }),
    );

    const { result } = setup(id);

    await tick(50);
    expect(result.current.phase).toBe('pending');

    await tick(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe('pending');
    expect(calls).toBe(2);

    await tick(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe('final');
    expect(calls).toBe(3);
  });

  it('stops polling on a 404 and moves to not-found, with no further requests', async () => {
    let calls = 0;

    server.use(
      http.get(`*/api/v1/transactions/${UNKNOWN_ID}`, () => {
        calls += 1;

        return HttpResponse.json(
          { code: 'TRANSACTION_NOT_FOUND', title: 'Transaction not found' },
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }),
    );

    const { result } = setup(UNKNOWN_ID);

    await tick(50);
    expect(result.current.phase).toBe('not-found');
    expect(calls).toBe(1);

    await tick(POLL_INTERVAL_MS * 3);
    expect(result.current.phase).toBe('not-found');
    expect(calls).toBe(1);
  });

  it('reaches under-review after 60s of PENDING, and restart() opens a new window', async () => {
    const { result } = setup(transactionPendingFixture.id);

    await tick(50);
    expect(result.current.phase).toBe('pending');

    await tick(POLL_TIMEOUT_MS);
    expect(result.current.phase).toBe('under-review');

    const reviewState = result.current;

    if (reviewState.phase !== 'under-review') {
      throw new Error('expected phase to be under-review');
    }

    act(() => reviewState.restart());

    await tick(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe('pending');
  });

  it('starts polling again from the id alone after a remount (simulated refresh)', async () => {
    const first = setup(transactionProgressingId);

    await tick(50);
    expect(first.result.current.phase).toBe('pending');

    first.unmount();

    const second = setup(transactionProgressingId);

    await tick(50);
    expect(second.result.current.phase).toBe('pending');
  });
});
