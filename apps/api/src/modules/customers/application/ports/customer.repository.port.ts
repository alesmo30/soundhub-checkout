import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import type { ResultAsync } from '../../../../shared/domain/result';
import type { Customer } from '../../domain/customer';

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export type NewCustomer = Omit<Customer, 'id'>;

export interface CustomerRepository {
  findById(id: string): ResultAsync<Customer | null, never>;
  findByDocumentNumber(documentNumber: string, tx?: TxContext): ResultAsync<Customer | null, never>;
  findByEmail(email: string, tx?: TxContext): ResultAsync<Customer | null, never>;
  insert(tx: TxContext, customer: NewCustomer): ResultAsync<Customer, never>;
  updateContact(
    tx: TxContext,
    change: { id: string; fullName: string; phone: string },
  ): ResultAsync<Customer, never>;
}
