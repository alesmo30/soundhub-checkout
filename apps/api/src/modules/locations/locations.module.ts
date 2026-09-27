import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MUNICIPALITY_REPOSITORY } from './application/ports/municipality.repository.port';
import { WAREHOUSE_REPOSITORY } from './application/ports/warehouse.repository.port';
import { MunicipalityOrmEntity } from './infrastructure/persistence/municipality.orm-entity';
import { TypeOrmMunicipalityRepository } from './infrastructure/persistence/typeorm-municipality.repository';
import { TypeOrmWarehouseRepository } from './infrastructure/persistence/typeorm-warehouse.repository';
import { WarehouseOrmEntity } from './infrastructure/persistence/warehouse.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([MunicipalityOrmEntity, WarehouseOrmEntity])],
  providers: [
    { provide: MUNICIPALITY_REPOSITORY, useClass: TypeOrmMunicipalityRepository },
    { provide: WAREHOUSE_REPOSITORY, useClass: TypeOrmWarehouseRepository },
  ],
  exports: [MUNICIPALITY_REPOSITORY, WAREHOUSE_REPOSITORY],
})
export class LocationsModule {}
