import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';

import { SqsEventPublisher } from './sqs-event-publisher';

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/queue';

function buildEvent() {
  return {
    type: 'transaction.finalized',
    transactionId: '7f3c1a2e-1111-4b11-8b11-000000000000',
    status: 'APPROVED',
    occurredAt: new Date('2026-09-27T12:00:00.000Z'),
  };
}

describe('SqsEventPublisher', () => {
  it('sends the event JSON as the body to the configured queue URL', async () => {
    const send = jest.fn().mockResolvedValue({});
    const client = { send } as unknown as SQSClient;
    const publisher = new SqsEventPublisher(client, QUEUE_URL);
    const event = buildEvent();

    const result = await publisher.publish(event);

    expect(result.isOk()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const [command] = send.mock.calls[0] as [SendMessageCommand];
    expect(command).toBeInstanceOf(SendMessageCommand);
    expect(command.input.QueueUrl).toBe(QUEUE_URL);
    expect(command.input.MessageBody).toBe(JSON.stringify(event));
  });

  it('returns Err with a message and no body when the SDK rejects', async () => {
    const send = jest.fn().mockRejectedValue(new Error('SQS is down'));
    const client = { send } as unknown as SQSClient;
    const publisher = new SqsEventPublisher(client, QUEUE_URL);

    const result = await publisher.publish(buildEvent());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ message: 'SQS is down' });
    }
  });

  it('falls back to a fixed message when the SDK rejects with a non-Error value', async () => {
    const send = jest.fn().mockRejectedValue('timeout');
    const client = { send } as unknown as SQSClient;
    const publisher = new SqsEventPublisher(client, QUEUE_URL);

    const result = await publisher.publish(buildEvent());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ message: 'Unknown SQS error' });
    }
  });
});
