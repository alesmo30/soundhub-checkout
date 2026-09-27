import { Inject, Injectable } from '@nestjs/common';
import type { ProductDetail } from '@checkout/shared/contracts';

import type { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import { maxPurchaseQuantity } from '../../domain/purchase-limit';
import { productNotFound } from '../../domain/product.errors';
import { vatIncludedInCents } from '../../domain/vat';
import { PRODUCT_REPOSITORY } from '../ports/product.repository.port';
import type { ProductRepository } from '../ports/product.repository.port';
import { toProductSummary } from './helpers/to-product-summary';

@Injectable()
export class GetProductDetailUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly productRepository: ProductRepository) {}

  execute(id: string): ResultAsync<ProductDetail, DomainError> {
    return this.productRepository.findById(id).andThen((product) => {
      if (!product) {
        return errAsync<ProductDetail, DomainError>(productNotFound(id));
      }

      return okAsync<ProductDetail, DomainError>({
        ...toProductSummary(product),
        description: product.description,
        vatIncludedInCents: vatIncludedInCents(product.priceInCents),
        maxPurchaseQuantity: maxPurchaseQuantity(product.stockAvailable),
      });
    });
  }
}
