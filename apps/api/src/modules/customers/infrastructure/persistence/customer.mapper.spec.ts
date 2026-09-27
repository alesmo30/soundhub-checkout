import { toCustomer, toCustomerFromReturningRow } from './customer.mapper';
import type { CustomerOrmEntity } from './customer.orm-entity';

function buildEntity(overrides: Partial<CustomerOrmEntity> = {}): CustomerOrmEntity {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    documentNumber: '1020304050',
    email: 'ana@mail.com',
    fullName: 'Ana Perez',
    phone: '3001234567',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('toCustomer', () => {
  it('maps every domain field from the ORM entity', () => {
    const entity = buildEntity();

    expect(toCustomer(entity)).toEqual({
      id: entity.id,
      documentNumber: entity.documentNumber,
      email: entity.email,
      fullName: entity.fullName,
      phone: entity.phone,
    });
  });

  it('does not leak ORM-only columns such as createdAt, updatedAt or deletedAt', () => {
    const customer = toCustomer(buildEntity());

    expect(customer).not.toHaveProperty('createdAt');
    expect(customer).not.toHaveProperty('updatedAt');
    expect(customer).not.toHaveProperty('deletedAt');
  });
});

describe('toCustomerFromReturningRow', () => {
  it('maps the snake_case UPDATE ... RETURNING * row to the Customer domain shape', () => {
    const row = {
      id: 'a0000000-0000-4000-8000-000000000001',
      document_number: '1020304050',
      email: 'ana@mail.com',
      full_name: 'Ana Updated',
      phone: '3009999999',
    };

    expect(toCustomerFromReturningRow(row)).toEqual({
      id: row.id,
      documentNumber: row.document_number,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
    });
  });
});
