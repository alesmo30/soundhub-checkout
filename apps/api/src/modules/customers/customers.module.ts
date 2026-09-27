import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UNIT_OF_WORK } from '../../shared/application/ports/unit-of-work.port';
import { TypeOrmUnitOfWork } from '../../shared/infrastructure/persistence/typeorm-unit-of-work';
import { CUSTOMER_REPOSITORY } from './application/ports/customer.repository.port';
import { GetCustomerUseCase } from './application/use-cases/get-customer.use-case';
import { UpsertCustomerUseCase } from './application/use-cases/upsert-customer.use-case';
import { CustomersController } from './infrastructure/http/customers.controller';
import { CustomerOrmEntity } from './infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm-customer.repository';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerOrmEntity])],
  controllers: [CustomersController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: UNIT_OF_WORK, useClass: TypeOrmUnitOfWork },
    UpsertCustomerUseCase,
    GetCustomerUseCase,
  ],
  exports: [CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
