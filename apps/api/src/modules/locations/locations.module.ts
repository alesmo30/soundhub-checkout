import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MUNICIPALITY_REPOSITORY } from './application/ports/municipality.repository.port';
import { WAREHOUSE_REPOSITORY } from './application/ports/warehouse.repository.port';
import { ListDepartmentsUseCase } from './application/use-cases/list-departments.use-case';
import { ListMunicipalitiesUseCase } from './application/use-cases/list-municipalities.use-case';
import { LocationsController } from './infrastructure/http/locations.controller';
import { MunicipalityOrmEntity } from './infrastructure/persistence/municipality.orm-entity';
import { TypeOrmMunicipalityRepository } from './infrastructure/persistence/typeorm-municipality.repository';
import { TypeOrmWarehouseRepository } from './infrastructure/persistence/typeorm-warehouse.repository';
import { WarehouseOrmEntity } from './infrastructure/persistence/warehouse.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([MunicipalityOrmEntity, WarehouseOrmEntity])],
  controllers: [LocationsController],
  providers: [
    { provide: MUNICIPALITY_REPOSITORY, useClass: TypeOrmMunicipalityRepository },
    { provide: WAREHOUSE_REPOSITORY, useClass: TypeOrmWarehouseRepository },
    ListDepartmentsUseCase,
    ListMunicipalitiesUseCase,
  ],
  exports: [MUNICIPALITY_REPOSITORY, WAREHOUSE_REPOSITORY],
})
export class LocationsModule {}
