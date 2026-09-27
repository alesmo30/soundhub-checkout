import type { ProductRepository } from '../../../catalog';
import type { MunicipalityRepository, WarehouseRepository } from '../../../locations';
import type { DeliveryFeeResolver } from '../../domain/delivery-fee/delivery-fee.resolver';

// Bundles GetQuoteUseCase's 4 collaborators behind one DI token so its
// constructor stays at 1 positional parameter (see
// references/coding-conventions.md#c1 — bundle beyond 3 into a named
// interface). pricing.module.ts builds this object once from the already
// wired repositories and the single DeliveryFeeResolver instance.
export const GET_QUOTE_DEPENDENCIES = Symbol('GET_QUOTE_DEPENDENCIES');

export interface GetQuoteDependencies {
  readonly productRepository: ProductRepository;
  readonly municipalityRepository: MunicipalityRepository;
  readonly warehouseRepository: WarehouseRepository;
  readonly deliveryFeeResolver: DeliveryFeeResolver;
}
