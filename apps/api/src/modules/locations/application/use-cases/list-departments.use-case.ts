import { Inject, Injectable } from '@nestjs/common';
import type { Department } from '@checkout/shared/contracts';

import { ResultAsync } from '../../../../shared/domain/result';
import { MUNICIPALITY_REPOSITORY } from '../ports/municipality.repository.port';
import type { MunicipalityRepository } from '../ports/municipality.repository.port';

@Injectable()
export class ListDepartmentsUseCase {
  constructor(
    @Inject(MUNICIPALITY_REPOSITORY)
    private readonly municipalityRepository: MunicipalityRepository,
  ) {}

  execute(): ResultAsync<Department[], never> {
    return this.municipalityRepository.listDepartments();
  }
}
