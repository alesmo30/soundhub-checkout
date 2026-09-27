import type { DomainEvent } from '../../domain/domain-event';
import type { ResultAsync } from '../../domain/result';

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface EventPublishError {
  readonly message: string;
}

export interface EventPublisher {
  publish(event: DomainEvent): ResultAsync<void, EventPublishError>;
}
