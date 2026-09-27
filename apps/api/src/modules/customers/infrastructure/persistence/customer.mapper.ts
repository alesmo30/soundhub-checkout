import type { Customer } from '../../domain/customer';
import type { CustomerOrmEntity } from './customer.orm-entity';

export function toCustomer(entity: CustomerOrmEntity): Customer {
  return {
    id: entity.id,
    documentNumber: entity.documentNumber,
    email: entity.email,
    fullName: entity.fullName,
    phone: entity.phone,
  };
}

// `UPDATE ... RETURNING *` comes back as the pg driver's raw row (real
// Postgres column names), unlike `INSERT ... RETURNING *`, which TypeORM
// re-hydrates into entity property names via its own column metadata.
export interface CustomerReturningRow {
  readonly id: string;
  readonly document_number: string;
  readonly email: string;
  readonly full_name: string;
  readonly phone: string;
}

export function toCustomerFromReturningRow(row: CustomerReturningRow): Customer {
  return {
    id: row.id,
    documentNumber: row.document_number,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
  };
}
