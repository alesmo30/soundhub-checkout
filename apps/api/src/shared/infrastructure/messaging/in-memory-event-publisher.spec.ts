import { Logger } from '@nestjs/common';

import { InMemoryEventPublisher } from './in-memory-event-publisher';

describe('InMemoryEventPublisher', () => {
  it('logs the event and returns Ok', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const publisher = new InMemoryEventPublisher();
    const event = {
      type: 'transaction.finalized',
      transactionId: '7f3c1a2e-1111-4b11-8b11-000000000000',
      status: 'APPROVED',
      occurredAt: new Date('2026-09-27T12:00:00.000Z'),
    };

    const result = await publisher.publish(event);

    expect(result.isOk()).toBe(true);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [string];
    expect(line).toContain(event.type);
    expect(line).toContain(event.transactionId);
    expect(line).toContain(event.status);

    logSpy.mockRestore();
  });
});
