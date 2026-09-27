import { Inject, Injectable } from '@nestjs/common';
import type { Municipality as MunicipalityView } from '@checkout/shared/contracts';

import type { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import { departmentNotFound } from '../../domain/location.errors';
import { MUNICIPALITY_REPOSITORY } from '../ports/municipality.repository.port';
import type { MunicipalityRepository } from '../ports/municipality.repository.port';

@Injectable()
export class ListMunicipalitiesUseCase {
  constructor(
    @Inject(MUNICIPALITY_REPOSITORY)
    private readonly municipalityRepository: MunicipalityRepository,
  ) {}

  execute(departmentCode: string): ResultAsync<MunicipalityView[], DomainError> {
    return this.municipalityRepository
      .listByDepartment(departmentCode)
      .andThen((municipalities) => {
        if (municipalities.length === 0) {
          return errAsync<MunicipalityView[], DomainError>(departmentNotFound(departmentCode));
        }

        return okAsync<MunicipalityView[], DomainError>(
          municipalities.map(({ code, name, isMetroArea }) => ({ code, name, isMetroArea })),
        );
      });
  }
}
