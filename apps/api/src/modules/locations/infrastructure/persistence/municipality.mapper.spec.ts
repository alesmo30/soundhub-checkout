import { toMunicipality } from './municipality.mapper';
import type { MunicipalityOrmEntity } from './municipality.orm-entity';

function buildEntity(overrides: Partial<MunicipalityOrmEntity> = {}): MunicipalityOrmEntity {
  return {
    code: '05001',
    name: 'Medellín',
    departmentCode: '05',
    departmentName: 'Antioquia',
    latitude: 6.244203,
    longitude: -75.581212,
    isMetroArea: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('toMunicipality', () => {
  it('maps every ORM column to its domain field', () => {
    const entity = buildEntity();

    expect(toMunicipality(entity)).toEqual({
      code: entity.code,
      name: entity.name,
      departmentCode: entity.departmentCode,
      departmentName: entity.departmentName,
      latitude: entity.latitude,
      longitude: entity.longitude,
      isMetroArea: entity.isMetroArea,
    });
  });

  it('does not leak ORM-only columns such as updatedAt or deletedAt', () => {
    const entity = buildEntity();

    expect(toMunicipality(entity)).not.toHaveProperty('updatedAt');
    expect(toMunicipality(entity)).not.toHaveProperty('deletedAt');
  });

  it('keeps coordinates as numbers, matching the numeric transformer', () => {
    const entity = buildEntity({ latitude: 4.710989, longitude: -74.072092 });

    const municipality = toMunicipality(entity);

    expect(typeof municipality.latitude).toBe('number');
    expect(typeof municipality.longitude).toBe('number');
  });
});
