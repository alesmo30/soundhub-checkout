import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CUSTOMER_REPOSITORY } from './application/ports/customer.repository.port';
import { CustomerOrmEntity } from './infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm-customer.repository';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerOrmEntity])],
  providers: [{ provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository }],
  exports: [CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
