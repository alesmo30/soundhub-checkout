import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LocationsModule } from '../locations/locations.module';
import { DELIVERY_REPOSITORY } from './application/ports/delivery.repository.port';
import { GetDeliveryUseCase } from './application/use-cases/get-delivery.use-case';
import { DeliveryOrmEntity } from './infrastructure/persistence/delivery.orm-entity';
import { TypeOrmDeliveryRepository } from './infrastructure/persistence/typeorm-delivery.repository';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryOrmEntity]), LocationsModule],
  providers: [
    { provide: DELIVERY_REPOSITORY, useClass: TypeOrmDeliveryRepository },
    GetDeliveryUseCase,
  ],
  exports: [DELIVERY_REPOSITORY],
})
export class DeliveriesModule {}
