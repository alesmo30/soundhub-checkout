import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import type { ResultAsync } from '../../../../shared/domain/result';
import type { Delivery } from '../../domain/delivery';

export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');

// Created AWAITING_PAYMENT; the rest is DB-managed.
export type NewDelivery = Omit<Delivery, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export interface DeliveryRepository {
  findById(id: string): ResultAsync<Delivery | null, never>;
  findByTransactionId(transactionId: string, tx?: TxContext): ResultAsync<Delivery | null, never>;
  insert(tx: TxContext, delivery: NewDelivery): ResultAsync<Delivery, never>;
  // Conditional UPDATE ... WHERE status = 'AWAITING_PAYMENT'.
  transition(
    tx: TxContext,
    change: { transactionId: string; to: 'READY_TO_SHIP' | 'CANCELLED' },
  ): ResultAsync<void, never>;
}
