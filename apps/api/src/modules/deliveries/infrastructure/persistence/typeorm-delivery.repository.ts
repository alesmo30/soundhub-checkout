import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';

import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import { ResultAsync } from '../../../../shared/domain/result';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type {
  DeliveryRepository,
  NewDelivery,
} from '../../application/ports/delivery.repository.port';
import type { Delivery } from '../../domain/delivery';
import { toDelivery } from './delivery.mapper';
import { DeliveryOrmEntity } from './delivery.orm-entity';

// See docs/design/01-data-model.md#4-stock-operations for the verbatim
// statements; only the `:id` placeholder became `$1`. Two separate constants
// so each statement's target status stays the literal the design doc wrote,
// per C11 ("the SQL itself is the guarantee").
const READY_TO_SHIP_SQL = `UPDATE deliveries SET status = 'READY_TO_SHIP', updated_at = now() WHERE transaction_id = $1 AND status = 'AWAITING_PAYMENT'`;

const CANCELLED_SQL = `UPDATE deliveries SET status = 'CANCELLED', updated_at = now() WHERE transaction_id = $1 AND status = 'AWAITING_PAYMENT'`;

@Injectable()
export class TypeOrmDeliveryRepository implements DeliveryRepository {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  findById(id: string): ResultAsync<Delivery | null, never> {
    const query = this.manager
      .findOne(DeliveryOrmEntity, { where: { id } })
      .then((entity) => (entity ? toDelivery(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }

  findByTransactionId(transactionId: string, tx?: TxContext): ResultAsync<Delivery | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .findOne(DeliveryOrmEntity, { where: { transactionId } })
      .then((entity) => (entity ? toDelivery(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }

  insert(tx: TxContext, delivery: NewDelivery): ResultAsync<Delivery, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .createQueryBuilder()
      .insert()
      .into(DeliveryOrmEntity)
      .values(delivery)
      .returning('*')
      .execute()
      .then((result) => toDelivery(result.generatedMaps[0] as DeliveryOrmEntity));

    return ResultAsync.fromSafePromise(query);
  }

  transition(
    tx: TxContext,
    change: { transactionId: string; to: 'READY_TO_SHIP' | 'CANCELLED' },
  ): ResultAsync<void, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const sql = change.to === 'READY_TO_SHIP' ? READY_TO_SHIP_SQL : CANCELLED_SQL;
    const query: Promise<void> = manager.query(sql, [change.transactionId]).then(() => undefined);

    return ResultAsync.fromSafePromise(query);
  }
}
