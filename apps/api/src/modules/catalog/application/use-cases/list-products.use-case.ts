import { Inject, Injectable } from '@nestjs/common';
import type { Paginated, ProductSummary } from '@checkout/shared/contracts';

import { ResultAsync } from '../../../../shared/domain/result';
import { PRODUCT_REPOSITORY } from '../ports/product.repository.port';
import type { ProductRepository } from '../ports/product.repository.port';
import { buildPaginationMeta } from './helpers/build-pagination-meta';
import { toProductSummary } from './helpers/to-product-summary';

interface ListProductsQuery {
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class ListProductsUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly productRepository: ProductRepository) {}

  execute(query: ListProductsQuery): ResultAsync<Paginated<ProductSummary>, never> {
    return this.productRepository.findPage(query).map(({ items, totalItems }) => ({
      data: items.map(toProductSummary),
      meta: buildPaginationMeta({ page: query.page, limit: query.limit, totalItems }),
    }));
  }
}
