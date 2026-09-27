import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PRODUCT_REPOSITORY } from './application/ports/product.repository.port';
import { GetProductDetailUseCase } from './application/use-cases/get-product-detail.use-case';
import { ListProductsUseCase } from './application/use-cases/list-products.use-case';
import { ProductsController } from './infrastructure/http/products.controller';
import { ProductOrmEntity } from './infrastructure/persistence/product.orm-entity';
import { TypeOrmProductRepository } from './infrastructure/persistence/typeorm-product.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ProductOrmEntity])],
  controllers: [ProductsController],
  providers: [
    { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository },
    ListProductsUseCase,
    GetProductDetailUseCase,
  ],
  exports: [PRODUCT_REPOSITORY],
})
export class CatalogModule {}
