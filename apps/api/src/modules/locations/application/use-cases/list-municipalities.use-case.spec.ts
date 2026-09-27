import { ErrorCode } from '@checkout/shared/enums';

import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Department } from '../../domain/department';
import type { Municipality } from '../../domain/municipality';
import type { MunicipalityRepository } from '../ports/municipality.repository.port';
import { ListMunicipalitiesUseCase } from './list-municipalities.use-case';

function buildMunicipality(overrides: Partial<Municipality> = {}): Municipality {
  return {
    code: '05001',
    name: 'Medellín',
    departmentCode: '05',
    departmentName: 'Antioquia',
    latitude: 6.244203,
    longitude: -75.581212,
    isMetroArea: true,
    ...overrides,
  };
}

class FakeMunicipalityRepository implements MunicipalityRepository {
  constructor(private readonly municipalities: Municipality[]) {}

  listDepartments(): ResultAsync<Department[], never> {
    return okAsync([]);
  }

  listByDepartment(departmentCode: string): ResultAsync<Municipality[], never> {
    return okAsync(
      this.municipalities.filter((municipality) => municipality.departmentCode === departmentCode),
    );
  }

  findByCode(): ResultAsync<Municipality | null, never> {
    return okAsync(null);
  }
}

describe('ListMunicipalitiesUseCase', () => {
  it('maps municipalities of a known department to { code, name, isMetroArea }', async () => {
    const municipalities = [
      buildMunicipality({ code: '05001', name: 'Medellín', isMetroArea: true }),
      buildMunicipality({ code: '05887', name: 'Yolombó', isMetroArea: false }),
    ];
    const useCase = new ListMunicipalitiesUseCase(new FakeMunicipalityRepository(municipalities));

    const result = await useCase.execute('05');
    const value = result._unsafeUnwrap();

    expect(value).toEqual([
      { code: '05001', name: 'Medellín', isMetroArea: true },
      { code: '05887', name: 'Yolombó', isMetroArea: false },
    ]);
  });

  it('returns DEPARTMENT_NOT_FOUND when listByDepartment reports an empty list', async () => {
    const useCase = new ListMunicipalitiesUseCase(new FakeMunicipalityRepository([]));

    const result = await useCase.execute('99');
    const error = result._unsafeUnwrapErr();

    expect(error.code).toBe(ErrorCode.DEPARTMENT_NOT_FOUND);
    expect(error.kind).toBe('NOT_FOUND');
  });
});
