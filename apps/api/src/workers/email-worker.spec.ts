import { Logger } from '@nestjs/common';
import type { SQSEvent, SQSRecord } from 'aws-lambda';

import type { SendTransactionEmailUseCase } from '../modules/notifications';
import { err, ok } from '../shared/domain/result';
import { processBatch } from './email-worker';

function buildRecord(overrides: Partial<SQSRecord> = {}): SQSRecord {
  return {
    messageId: 'msg-1',
    receiptHandle: 'receipt-1',
    body: JSON.stringify({ transactionId: 'transaction-1' }),
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: '0',
      SenderId: 'sender',
      ApproximateFirstReceiveTimestamp: '0',
    },
    messageAttributes: {},
    md5OfBody: 'md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:queue',
    awsRegion: 'us-east-1',
    ...overrides,
  };
}

function buildEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

// A fake, not a jest.fn: each call can be delayed by a different amount so
// the sequential-processing spec can prove call order under real async
// interleaving, not just call count.
type Outcome = 'SENT' | 'ALREADY_SENT' | 'SKIPPED';

class FakeUseCase {
  readonly calls: string[] = [];
  private readonly errorTransactionIds = new Set<string>();
  private readonly delaysMs = new Map<string, number>();
  private readonly outcomes = new Map<string, Outcome>();

  queueError(transactionId: string): void {
    this.errorTransactionIds.add(transactionId);
  }

  queueDelay(transactionId: string, ms: number): void {
    this.delaysMs.set(transactionId, ms);
  }

  queueOutcome(transactionId: string, outcome: Outcome): void {
    this.outcomes.set(transactionId, outcome);
  }

  execute(transactionId: string): ReturnType<SendTransactionEmailUseCase['execute']> {
    this.calls.push(`start:${transactionId}`);
    const delay = this.delaysMs.get(transactionId) ?? 0;

    const settle = async () => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      this.calls.push(`end:${transactionId}`);
      return this.errorTransactionIds.has(transactionId)
        ? err({ message: 'send failed' })
        : ok(this.outcomes.get(transactionId) ?? 'SENT');
    };

    // A plain Promise<Result<...>> resolves the same way `await` unwraps a
    // real ResultAsync, without depending on neverthrow's internal shape.
    return settle() as unknown as ReturnType<SendTransactionEmailUseCase['execute']>;
  }
}

describe('processBatch', () => {
  it('reports only the messageId of a failing record in a batch of 5', async () => {
    const useCase = new FakeUseCase();
    useCase.queueError('transaction-3');
    const records = [1, 2, 3, 4, 5].map((n) =>
      buildRecord({
        messageId: `msg-${n}`,
        body: JSON.stringify({ transactionId: `transaction-${n}` }),
      }),
    );

    const response = await processBatch(
      buildEvent(records),
      useCase as unknown as SendTransactionEmailUseCase,
    );

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'msg-3' }]);
  });

  it('processes records sequentially, never overlapping', async () => {
    const useCase = new FakeUseCase();
    useCase.queueDelay('transaction-1', 20);
    const records = [
      buildRecord({ messageId: 'msg-1', body: JSON.stringify({ transactionId: 'transaction-1' }) }),
      buildRecord({ messageId: 'msg-2', body: JSON.stringify({ transactionId: 'transaction-2' }) }),
    ];

    await processBatch(buildEvent(records), useCase as unknown as SendTransactionEmailUseCase);

    expect(useCase.calls).toEqual([
      'start:transaction-1',
      'end:transaction-1',
      'start:transaction-2',
      'end:transaction-2',
    ]);
  });

  it('logs a malformed body at error, does not report it, and still processes the rest', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const useCase = new FakeUseCase();
    const records = [
      buildRecord({ messageId: 'msg-bad', body: 'not json' }),
      buildRecord({
        messageId: 'msg-good',
        body: JSON.stringify({ transactionId: 'transaction-2' }),
      }),
    ];

    const response = await processBatch(
      buildEvent(records),
      useCase as unknown as SendTransactionEmailUseCase,
    );

    expect(response.batchItemFailures).toEqual([]);
    expect(useCase.calls).toEqual(['start:transaction-2', 'end:transaction-2']);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('msg-bad'));

    errorSpy.mockRestore();
  });

  it('does not report a record with no transactionId in the body', async () => {
    const useCase = new FakeUseCase();
    const records = [buildRecord({ messageId: 'msg-1', body: JSON.stringify({ foo: 'bar' }) })];

    const response = await processBatch(
      buildEvent(records),
      useCase as unknown as SendTransactionEmailUseCase,
    );

    expect(response.batchItemFailures).toEqual([]);
    expect(useCase.calls).toEqual([]);
  });

  it.each(['SKIPPED', 'ALREADY_SENT'] as const)('does not report a %s outcome', async (outcome) => {
    const useCase = new FakeUseCase();
    useCase.queueOutcome('transaction-1', outcome);
    const records = [
      buildRecord({ messageId: 'msg-1', body: JSON.stringify({ transactionId: 'transaction-1' }) }),
    ];

    const response = await processBatch(
      buildEvent(records),
      useCase as unknown as SendTransactionEmailUseCase,
    );

    expect(response.batchItemFailures).toEqual([]);
  });

  it('returns an empty batchItemFailures for an empty batch', async () => {
    const useCase = new FakeUseCase();

    const response = await processBatch(
      buildEvent([]),
      useCase as unknown as SendTransactionEmailUseCase,
    );

    expect(response).toEqual({ batchItemFailures: [] });
  });
});
