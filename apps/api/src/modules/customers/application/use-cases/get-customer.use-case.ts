import { Inject, Injectable } from '@nestjs/common';

import type { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import { customerNotFound } from '../../domain/customer.errors';
import type { Customer } from '../../domain/customer';
import type { CustomerRepository } from '../ports/customer.repository.port';
import { CUSTOMER_REPOSITORY } from '../ports/customer.repository.port';

@Injectable()
export class GetCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: CustomerRepository,
  ) {}

  execute(id: string): ResultAsync<Customer, DomainError> {
    return this.customerRepository.findById(id).andThen((customer) => {
      if (!customer) {
        return errAsync<Customer, DomainError>(customerNotFound());
      }

      return okAsync<Customer, DomainError>(customer);
    });
  }
}
