import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PRODUCT_REPOSITORY } from './application/ports/product.repository.port';
import { ProductOrmEntity } from './infrastructure/persistence/product.orm-entity';
import { TypeOrmProductRepository } from './infrastructure/persistence/typeorm-product.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ProductOrmEntity])],
  providers: [{ provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository }],
  exports: [PRODUCT_REPOSITORY],
})
export class CatalogModule {}
