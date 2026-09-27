import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';

import { ResultAsync } from '../../../../shared/domain/result';
import type { WarehouseRepository } from '../../application/ports/warehouse.repository.port';
import type { Warehouse } from '../../domain/warehouse';
import { toWarehouse } from './warehouse.mapper';
import { WarehouseOrmEntity } from './warehouse.orm-entity';

@Injectable()
export class TypeOrmWarehouseRepository implements WarehouseRepository {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  listActive(): ResultAsync<Warehouse[], never> {
    const query = this.manager
      .find(WarehouseOrmEntity, { order: { name: 'ASC' } })
      .then((entities) => entities.map(toWarehouse));

    return ResultAsync.fromSafePromise(query);
  }

  findById(id: string): ResultAsync<Warehouse | null, never> {
    const query = this.manager
      .findOne(WarehouseOrmEntity, { where: { id } })
      .then((entity) => (entity ? toWarehouse(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }
}
