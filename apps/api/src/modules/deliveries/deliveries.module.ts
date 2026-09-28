import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DELIVERY_REPOSITORY } from './application/ports/delivery.repository.port';
import { DeliveryOrmEntity } from './infrastructure/persistence/delivery.orm-entity';
import { TypeOrmDeliveryRepository } from './infrastructure/persistence/typeorm-delivery.repository';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryOrmEntity])],
  providers: [{ provide: DELIVERY_REPOSITORY, useClass: TypeOrmDeliveryRepository }],
  exports: [DELIVERY_REPOSITORY],
})
export class DeliveriesModule {}
