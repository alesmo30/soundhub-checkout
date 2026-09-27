import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';

import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import { ResultAsync } from '../../../../shared/domain/result';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type {
  CustomerRepository,
  CustomerUniqueViolation,
  NewCustomer,
} from '../../application/ports/customer.repository.port';
import type { Customer } from '../../domain/customer';
import {
  toCustomer,
  toCustomerFromReturningRow,
  type CustomerReturningRow,
} from './customer.mapper';
import { CustomerOrmEntity } from './customer.orm-entity';
import { toUniqueViolation } from './helpers/to-unique-violation';

interface ContactChange {
  id: string;
  fullName: string;
  phone: string;
}

@Injectable()
export class TypeOrmCustomerRepository implements CustomerRepository {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  findById(id: string, tx?: TxContext): ResultAsync<Customer | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .findOne(CustomerOrmEntity, { where: { id } })
      .then((entity) => (entity ? toCustomer(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }

  findByDocumentNumber(
    documentNumber: string,
    tx?: TxContext,
  ): ResultAsync<Customer | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .findOne(CustomerOrmEntity, { where: { documentNumber } })
      .then((entity) => (entity ? toCustomer(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }

  findByEmail(email: string, tx?: TxContext): ResultAsync<Customer | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .createQueryBuilder(CustomerOrmEntity, 'customer')
      .where('LOWER(customer.email) = LOWER(:email)', { email })
      .getOne()
      .then((entity) => (entity ? toCustomer(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }

  insert(tx: TxContext, customer: NewCustomer): ResultAsync<Customer, CustomerUniqueViolation> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const promise = manager
      .createQueryBuilder()
      .insert()
      .into(CustomerOrmEntity)
      .values(customer)
      .returning('*')
      .execute()
      .then((result) => toCustomer(result.generatedMaps[0] as CustomerOrmEntity));

    return ResultAsync.fromPromise(promise, (error) => {
      const violation = toUniqueViolation(error);
      if (violation) return violation;
      // Not a unique-constraint violation on this table: an unexpected
      // failure, so it is re-thrown rather than folded into the Result
      // (see references/coding-conventions.md#c9).
      throw error;
    });
  }

  updateContact(tx: TxContext, change: ContactChange): ResultAsync<Customer, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .createQueryBuilder()
      .update(CustomerOrmEntity)
      .set({ fullName: change.fullName, phone: change.phone })
      .where('id = :id', { id: change.id })
      .returning('*')
      .execute()
      .then((result) => {
        const [row] = result.raw as CustomerReturningRow[];
        // change.id is a Customer that was just looked up in the same
        // transaction; zero rows here would mean it vanished mid-flow,
        // which is an unexpected failure, not an expected one (see C9).
        if (!row) throw new Error(`updateContact: no row returned for customer ${change.id}`);
        return toCustomerFromReturningRow(row);
      });

    return ResultAsync.fromSafePromise(query);
  }
}
