import { findNearestWarehouse } from './nearest-warehouse.finder';
import type { GeoPoint } from './geo-point';
import type { Warehouse } from './warehouse';

const ORIGIN: GeoPoint = { latitude: 4.711, longitude: -74.0721 };

function buildWarehouse(overrides: Partial<Warehouse>): Warehouse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Bodega Bogotá',
    municipalityCode: '11001',
    address: 'Calle 1 # 2-3',
    latitude: ORIGIN.latitude,
    longitude: ORIGIN.longitude,
    ...overrides,
  };
}

describe('findNearestWarehouse', () => {
  it('returns null for an empty list', () => {
    expect(findNearestWarehouse(ORIGIN, [])).toBeNull();
  });

  it('picks the closest warehouse and rounds its distance', () => {
    const near = buildWarehouse({ id: 'near', latitude: 4.72, longitude: -74.08 });
    const far = buildWarehouse({ id: 'far', latitude: 6.2442, longitude: -75.5812 });

    const result = findNearestWarehouse(ORIGIN, [far, near]);

    expect(result?.warehouse.id).toBe('near');
    expect(Number.isInteger(result?.distanceKm)).toBe(true);
  });

  it('resolves a tie in favour of the first warehouse in the list', () => {
    // Identical coordinates guarantee a bit-for-bit equal distance, so this
    // exercises the tie-break rather than a near-miss floating-point race.
    const first = buildWarehouse({ id: 'first', latitude: 4.8, longitude: -74.0721 });
    const second = buildWarehouse({ id: 'second', latitude: 4.8, longitude: -74.0721 });

    const result = findNearestWarehouse(ORIGIN, [first, second]);

    expect(result?.warehouse.id).toBe('first');
  });
});
