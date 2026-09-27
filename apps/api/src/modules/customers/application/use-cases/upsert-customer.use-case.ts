import { Inject, Injectable } from '@nestjs/common';
import type { UpsertCustomerRequest } from '@checkout/shared/contracts';

import type { TxContext, UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { UNIT_OF_WORK } from '../../../../shared/application/ports/unit-of-work.port';
import { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, ResultAsync } from '../../../../shared/domain/result';
import { customerDataMismatch, emailAlreadyRegistered } from '../../domain/customer.errors';
import type { Customer } from '../../domain/customer';
import type {
  CustomerRepository,
  CustomerUniqueViolation,
} from '../ports/customer.repository.port';
import { CUSTOMER_REPOSITORY } from '../ports/customer.repository.port';

export interface UpsertCustomerResult {
  readonly customer: Customer;
  readonly created: boolean;
}

@Injectable()
export class UpsertCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: CustomerRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  execute(cmd: UpsertCustomerRequest): ResultAsync<UpsertCustomerResult, DomainError> {
    return this.unitOfWork
      .run((tx) => this.upsertOnce(tx, cmd))
      .orElse((firstError) => {
        if (firstError instanceof DomainError) {
          return errAsync<UpsertCustomerResult, DomainError>(firstError);
        }

        // firstError is a CustomerUniqueViolation: another transaction won
        // the race between our check and our insert. Retrying once lets the
        // now-visible row be found by the same §6 lookups.
        return this.unitOfWork
          .run((tx) => this.upsertOnce(tx, cmd))
          .orElse((secondError) => {
            if (secondError instanceof DomainError) {
              return errAsync<UpsertCustomerResult, DomainError>(secondError);
            }

            // Two consecutive unique-constraint violations for the same
            // command should not happen in practice; the global exception
            // filter turns this into a 500 INTERNAL_ERROR at runtime (see
            // apps/api/src/modules/pricing/application/use-cases/get-quote.use-case.ts
            // for the same "throw" pattern on an unreachable state).
            throw new Error('UpsertCustomerUseCase: two consecutive unique-constraint violations');
          });
      });
  }

  private upsertOnce(
    tx: TxContext,
    cmd: UpsertCustomerRequest,
  ): ResultAsync<UpsertCustomerResult, DomainError | CustomerUniqueViolation> {
    return this.customerRepository
      .findByDocumentNumber(cmd.documentNumber, tx)
      .andThen((existing) => {
        if (existing) {
          if (existing.email.toLowerCase() !== cmd.email.toLowerCase()) {
            return errAsync<UpsertCustomerResult, DomainError>(customerDataMismatch());
          }

          return this.customerRepository
            .updateContact(tx, { id: existing.id, fullName: cmd.fullName, phone: cmd.phone })
            .map((customer): UpsertCustomerResult => ({ customer, created: false }));
        }

        return this.customerRepository.findByEmail(cmd.email, tx).andThen((byEmail) => {
          if (byEmail) {
            return errAsync<UpsertCustomerResult, DomainError>(emailAlreadyRegistered());
          }

          return this.customerRepository
            .insert(tx, {
              documentNumber: cmd.documentNumber,
              email: cmd.email,
              fullName: cmd.fullName,
              phone: cmd.phone,
            })
            .map((customer): UpsertCustomerResult => ({ customer, created: true }));
        });
      });
  }
}
