import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import type { ResultAsync } from '../../../../shared/domain/result';
import type { Product } from '../../domain/product';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export interface ProductPage {
  readonly items: Product[];
  readonly totalItems: number;
}

export interface ProductRepository {
  findPage(page: { page: number; limit: number }): ResultAsync<ProductPage, never>;
  findById(id: string, tx?: TxContext): ResultAsync<Product | null, never>;
}
