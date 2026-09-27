import type { TransactionStatus } from '@checkout/shared/enums';

import type { DomainEvent } from '../../../shared/domain/domain-event';

export interface TransactionFinalizedEvent extends DomainEvent {
  readonly type: 'transaction.finalized';
  readonly transactionId: string;
  readonly status: TransactionStatus;
}
