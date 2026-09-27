import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';

import type { TxContext } from '../../../../shared/application/ports/unit-of-work.port';
import { ResultAsync } from '../../../../shared/domain/result';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import type { MunicipalityRepository } from '../../application/ports/municipality.repository.port';
import type { Department } from '../../domain/department';
import type { Municipality } from '../../domain/municipality';
import { toMunicipality } from './municipality.mapper';
import { MunicipalityOrmEntity } from './municipality.orm-entity';

interface DepartmentRow {
  code: string;
  name: string;
}

@Injectable()
export class TypeOrmMunicipalityRepository implements MunicipalityRepository {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  listDepartments(): ResultAsync<Department[], never> {
    const query = this.manager
      .createQueryBuilder(MunicipalityOrmEntity, 'municipality')
      .select('municipality.departmentCode', 'code')
      .addSelect('municipality.departmentName', 'name')
      .distinct(true)
      .orderBy('municipality.departmentName', 'ASC')
      .getRawMany<DepartmentRow>();

    return ResultAsync.fromSafePromise(query);
  }

  listByDepartment(departmentCode: string): ResultAsync<Municipality[], never> {
    const query = this.manager
      .find(MunicipalityOrmEntity, { where: { departmentCode }, order: { name: 'ASC' } })
      .then((entities) => entities.map(toMunicipality));

    return ResultAsync.fromSafePromise(query);
  }

  findByCode(code: string, tx?: TxContext): ResultAsync<Municipality | null, never> {
    const manager = tx instanceof TypeOrmTxContext ? tx.manager : this.manager;
    const query = manager
      .findOne(MunicipalityOrmEntity, { where: { code } })
      .then((entity) => (entity ? toMunicipality(entity) : null));

    return ResultAsync.fromSafePromise(query);
  }
}
