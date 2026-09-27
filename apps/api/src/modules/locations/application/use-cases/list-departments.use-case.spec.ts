import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Department } from '../../domain/department';
import type { Municipality } from '../../domain/municipality';
import type { MunicipalityRepository } from '../ports/municipality.repository.port';
import { ListDepartmentsUseCase } from './list-departments.use-case';

class FakeMunicipalityRepository implements MunicipalityRepository {
  constructor(private readonly departments: Department[]) {}

  listDepartments(): ResultAsync<Department[], never> {
    return okAsync(this.departments);
  }

  listByDepartment(): ResultAsync<Municipality[], never> {
    return okAsync([]);
  }

  findByCode(): ResultAsync<Municipality | null, never> {
    return okAsync(null);
  }
}

describe('ListDepartmentsUseCase', () => {
  it('returns the departments from the repository as { code, name }, in the given order', async () => {
    const departments: Department[] = [
      { code: '05', name: 'Antioquia' },
      { code: '11', name: 'Bogotá D.C.' },
    ];
    const useCase = new ListDepartmentsUseCase(new FakeMunicipalityRepository(departments));

    const result = await useCase.execute();
    const value = result._unsafeUnwrap();

    expect(value).toEqual([
      { code: '05', name: 'Antioquia' },
      { code: '11', name: 'Bogotá D.C.' },
    ]);
  });

  it('returns an empty list when the repository has no departments', async () => {
    const useCase = new ListDepartmentsUseCase(new FakeMunicipalityRepository([]));

    const result = await useCase.execute();

    expect(result._unsafeUnwrap()).toEqual([]);
  });
});
