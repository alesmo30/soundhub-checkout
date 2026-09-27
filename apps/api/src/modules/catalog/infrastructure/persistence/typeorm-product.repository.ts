import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';

import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import { ResultAsync } from '../../../../shared/domain/result';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type {
  ProductPage,
  ProductRepository,
} from '../../application/ports/product.repository.port';
import type { Product } from '../../domain/product';
import { toProduct } from './product.mapper';
import { ProductOrmEntity } from './product.orm-entity';

interface ProductPageQuery {
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class TypeOrmProductRepository implements ProductRepository {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  findPage(page: ProductPageQuery): ResultAsync<ProductPage, never> {
    const query = this.manager
      .findAndCount(ProductOrmEntity, {
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      })
      .then(([entities, totalItems]) => ({
        items: entities.map(toProduct),
        totalItems,
      }));

    return ResultAsync.fromSafePromise(query);
  }

  findById(id: string, tx?: TxContext): ResultAsync<Product | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .findOne(ProductOrmEntity, { where: { id } })
      .then((entity) => (entity ? toProduct(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }
}
