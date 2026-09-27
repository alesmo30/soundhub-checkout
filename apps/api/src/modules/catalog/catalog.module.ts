import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { STOCK_RESERVATION } from '../transactions';
import { PRODUCT_REPOSITORY } from './application/ports/product.repository.port';
import { GetProductDetailUseCase } from './application/use-cases/get-product-detail.use-case';
import { ListProductsUseCase } from './application/use-cases/list-products.use-case';
import { ProductsController } from './infrastructure/http/products.controller';
import { ProductOrmEntity } from './infrastructure/persistence/product.orm-entity';
import { TypeOrmProductRepository } from './infrastructure/persistence/typeorm-product.repository';
import { TypeOrmStockReservationRepository } from './infrastructure/persistence/typeorm-stock-reservation.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ProductOrmEntity])],
  controllers: [ProductsController],
  providers: [
    { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository },
    { provide: STOCK_RESERVATION, useClass: TypeOrmStockReservationRepository },
    ListProductsUseCase,
    GetProductDetailUseCase,
  ],
  exports: [PRODUCT_REPOSITORY, STOCK_RESERVATION],
})
export class CatalogModule {}
