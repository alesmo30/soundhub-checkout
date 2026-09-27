import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MUNICIPALITY_REPOSITORY } from './application/ports/municipality.repository.port';
import { MunicipalityOrmEntity } from './infrastructure/persistence/municipality.orm-entity';
import { TypeOrmMunicipalityRepository } from './infrastructure/persistence/typeorm-municipality.repository';

@Module({
  imports: [TypeOrmModule.forFeature([MunicipalityOrmEntity])],
  providers: [{ provide: MUNICIPALITY_REPOSITORY, useClass: TypeOrmMunicipalityRepository }],
  exports: [MUNICIPALITY_REPOSITORY],
})
export class LocationsModule {}
