import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import type { ProductRepository } from '../catalog';
import { PRODUCT_REPOSITORY } from '../catalog';
import { LocationsModule } from '../locations/locations.module';
import type { MunicipalityRepository, WarehouseRepository } from '../locations';
import { MUNICIPALITY_REPOSITORY, WAREHOUSE_REPOSITORY } from '../locations';
import { DELIVERY_FEE_RESOLVER } from './application/ports/delivery-fee-resolver.token';
import { GET_QUOTE_DEPENDENCIES } from './application/ports/get-quote.dependencies';
import type { GetQuoteDependencies } from './application/ports/get-quote.dependencies';
import { GetQuoteUseCase } from './application/use-cases/get-quote.use-case';
import { DeliveryFeeResolver } from './domain/delivery-fee/delivery-fee.resolver';
import { FreeMetroStrategy } from './domain/delivery-fee/free-metro.strategy';
import { MetroFlatStrategy } from './domain/delivery-fee/metro-flat.strategy';
import { NationalDistanceStrategy } from './domain/delivery-fee/national-distance.strategy';

// Intermediate DI seam, local to this module: bundles the 3 repositories so
// the GET_QUOTE_DEPENDENCIES factory below only ever takes 2 positional
// parameters (repositories + resolver), never 4 (see
// references/coding-conventions.md#c1).
const QUOTE_REPOSITORIES = Symbol('QUOTE_REPOSITORIES');

interface QuoteRepositories {
  readonly productRepository: ProductRepository;
  readonly municipalityRepository: MunicipalityRepository;
  readonly warehouseRepository: WarehouseRepository;
}

@Module({
  imports: [CatalogModule, LocationsModule],
  providers: [
    {
      provide: QUOTE_REPOSITORIES,
      useFactory: (
        productRepository: ProductRepository,
        municipalityRepository: MunicipalityRepository,
        warehouseRepository: WarehouseRepository,
      ): QuoteRepositories => ({
        productRepository,
        municipalityRepository,
        warehouseRepository,
      }),
      inject: [PRODUCT_REPOSITORY, MUNICIPALITY_REPOSITORY, WAREHOUSE_REPOSITORY],
    },
    {
      provide: DELIVERY_FEE_RESOLVER,
      useFactory: () =>
        new DeliveryFeeResolver([
          new FreeMetroStrategy(),
          new MetroFlatStrategy(),
          new NationalDistanceStrategy(),
        ]),
    },
    {
      provide: GET_QUOTE_DEPENDENCIES,
      useFactory: (
        repositories: QuoteRepositories,
        deliveryFeeResolver: DeliveryFeeResolver,
      ): GetQuoteDependencies => ({ ...repositories, deliveryFeeResolver }),
      inject: [QUOTE_REPOSITORIES, DELIVERY_FEE_RESOLVER],
    },
    GetQuoteUseCase,
  ],
  exports: [DELIVERY_FEE_RESOLVER, GetQuoteUseCase],
})
export class PricingModule {}
