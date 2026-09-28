import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { Injectable } from '@nestjs/common';

import type {
  EventPublishError,
  EventPublisher,
} from '../../application/ports/event-publisher.port';
import type { DomainEvent } from '../../domain/domain-event';
import { ResultAsync } from '../../domain/result';

@Injectable()
export class SqsEventPublisher implements EventPublisher {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  publish(event: DomainEvent): ResultAsync<void, EventPublishError> {
    const promise = this.client
      .send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(event),
        }),
      )
      .then(() => undefined);

    return ResultAsync.fromPromise(promise, (error): EventPublishError => ({
      message: error instanceof Error ? error.message : 'Unknown SQS error',
    }));
  }
}
