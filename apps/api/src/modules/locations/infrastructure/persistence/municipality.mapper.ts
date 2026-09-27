import type { Municipality } from '../../domain/municipality';
import type { MunicipalityOrmEntity } from './municipality.orm-entity';

export function toMunicipality(entity: MunicipalityOrmEntity): Municipality {
  return {
    code: entity.code,
    name: entity.name,
    departmentCode: entity.departmentCode,
    departmentName: entity.departmentName,
    latitude: entity.latitude,
    longitude: entity.longitude,
    isMetroArea: entity.isMetroArea,
  };
}
