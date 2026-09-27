import { ErrorCode } from '@checkout/shared/enums';

import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Customer } from '../../domain/customer';
import type {
  CustomerRepository,
  CustomerUniqueViolation,
  NewCustomer,
} from '../ports/customer.repository.port';
import { GetCustomerUseCase } from './get-customer.use-case';

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    documentNumber: '1000000001',
    email: 'ana@mail.com',
    fullName: 'Ana Gómez',
    phone: '3000000001',
    ...overrides,
  };
}

// Only findById is exercised by GetCustomerUseCase; the rest of the port is
// implemented just to satisfy the interface.
class FakeCustomerRepository implements CustomerRepository {
  constructor(private readonly customers: Customer[]) {}

  findById(id: string): ResultAsync<Customer | null, never> {
    return okAsync(this.customers.find((customer) => customer.id === id) ?? null);
  }

  findByDocumentNumber(): ResultAsync<Customer | null, never> {
    return okAsync(null);
  }

  findByEmail(): ResultAsync<Customer | null, never> {
    return okAsync(null);
  }

  insert(_tx: unknown, customer: NewCustomer): ResultAsync<Customer, CustomerUniqueViolation> {
    return okAsync({ id: 'unused', ...customer });
  }

  updateContact(): ResultAsync<Customer, never> {
    throw new Error('not implemented');
  }
}

describe('GetCustomerUseCase', () => {
  it('returns the customer when found', async () => {
    const customer = buildCustomer();
    const useCase = new GetCustomerUseCase(new FakeCustomerRepository([customer]));

    const result = await useCase.execute(customer.id);

    expect(result._unsafeUnwrap()).toEqual(customer);
  });

  it('rejects with CUSTOMER_NOT_FOUND when the customer does not exist', async () => {
    const useCase = new GetCustomerUseCase(new FakeCustomerRepository([]));

    const result = await useCase.execute('missing-id');
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.CUSTOMER_NOT_FOUND);
    expect(error.kind).toBe('NOT_FOUND');
  });
});
