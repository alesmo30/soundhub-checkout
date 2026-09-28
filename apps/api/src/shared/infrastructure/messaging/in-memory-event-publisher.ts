import { Injectable, Logger } from '@nestjs/common';

import type { EventPublishError, EventPublisher } from '../../application/ports/event-publisher.port';
import type { DomainEvent } from '../../domain/domain-event';
import { okAsync, ResultAsync } from '../../domain/result';

// Fire-and-log stand-in for the SQS adapter api 06 will bind under the same
// EVENT_PUBLISHER token. No subscribers and no accumulated array: see
// SPEC 10's Decisions > Event publishing for why both were rejected.
@Injectable()
export class InMemoryEventPublisher implements EventPublisher {
  private readonly logger = new Logger(InMemoryEventPublisher.name);

  publish(event: DomainEvent): ResultAsync<void, EventPublishError> {
    this.logger.log(`event published ${JSON.stringify(event)}`);
    return okAsync(undefined);
  }
}
