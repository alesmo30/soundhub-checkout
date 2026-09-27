import { Inject, Injectable } from '@nestjs/common';
import { CURRENCY } from '@checkout/shared/constants';
import type { Quote, QuoteQuery } from '@checkout/shared/contracts';

import { findNearestWarehouse } from '../../../locations';
import { vatIncludedInCents } from '../../../catalog';
import type { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import { baseFeeInCents } from '../../domain/base-fee';
import {
  outOfStock,
  quoteMunicipalityNotFound,
  quoteProductNotFound,
} from '../../domain/quote.errors';
import { GET_QUOTE_DEPENDENCIES } from '../ports/get-quote.dependencies';
import type { GetQuoteDependencies } from '../ports/get-quote.dependencies';

@Injectable()
export class GetQuoteUseCase {
  constructor(@Inject(GET_QUOTE_DEPENDENCIES) private readonly deps: GetQuoteDependencies) {}

  execute(query: QuoteQuery): ResultAsync<Quote, DomainError> {
    const { productRepository, municipalityRepository, warehouseRepository, deliveryFeeResolver } =
      this.deps;

    return ResultAsync.combine([
      productRepository.findById(query.productId),
      municipalityRepository.findByCode(query.municipalityCode),
      warehouseRepository.listActive(),
    ]).andThen(([product, municipality, warehouses]) => {
      if (!product) {
        return errAsync<Quote, DomainError>(quoteProductNotFound());
      }

      if (!municipality) {
        return errAsync<Quote, DomainError>(quoteMunicipalityNotFound());
      }

      if (query.quantity > product.stockAvailable) {
        return errAsync<Quote, DomainError>(outOfStock(product.stockAvailable));
      }

      const nearest = findNearestWarehouse(municipality, warehouses);

      if (!nearest) {
        // Configuration data the caller cannot fix; the global exception
        // filter turns this into a 500 INTERNAL_ERROR at runtime.
        throw new Error('No active warehouse');
      }

      const subtotalInCents = product.priceInCents * query.quantity;
      const baseFeeAmountInCents = baseFeeInCents(subtotalInCents);
      const delivery = deliveryFeeResolver.resolve({
        subtotalInCents,
        isMetroArea: municipality.isMetroArea,
        distanceKm: nearest.distanceKm,
      });

      return okAsync<Quote, DomainError>({
        product: {
          id: product.id,
          name: product.name,
          unitPriceInCents: product.priceInCents,
        },
        quantity: query.quantity,
        subtotalInCents,
        vatIncludedInCents: vatIncludedInCents(subtotalInCents),
        baseFeeInCents: baseFeeAmountInCents,
        delivery: {
          feeInCents: delivery.feeInCents,
          rule: delivery.rule,
          distanceKm: nearest.distanceKm,
          warehouse: { id: nearest.warehouse.id, name: nearest.warehouse.name },
        },
        totalInCents: subtotalInCents + baseFeeAmountInCents + delivery.feeInCents,
        currency: CURRENCY,
      });
    });
  }
}
