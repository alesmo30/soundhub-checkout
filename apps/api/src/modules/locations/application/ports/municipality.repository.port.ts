import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import type { ResultAsync } from '../../../../shared/domain/result';
import type { Department } from '../../domain/department';
import type { Municipality } from '../../domain/municipality';

export const MUNICIPALITY_REPOSITORY = Symbol('MUNICIPALITY_REPOSITORY');

export interface MunicipalityRepository {
  listDepartments(): ResultAsync<Department[], never>;
  listByDepartment(departmentCode: string): ResultAsync<Municipality[], never>;
  findByCode(code: string, tx?: TxContext): ResultAsync<Municipality | null, never>;
}
