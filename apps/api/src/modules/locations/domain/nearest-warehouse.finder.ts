import { haversineKm } from './haversine';
import type { GeoPoint } from './geo-point';
import type { Warehouse } from './warehouse';

export interface NearestWarehouse {
  readonly warehouse: Warehouse;
  readonly distanceKm: number;
}

/**
 * Picks the closest warehouse to `origin`. A strictly-less comparison keeps
 * the first warehouse in the input array on a tie, mirroring the
 * deterministic `ORDER BY name` that `listActive` applies before this runs.
 */
export function findNearestWarehouse(
  origin: GeoPoint,
  warehouses: readonly Warehouse[],
): NearestWarehouse | null {
  let nearest: NearestWarehouse | null = null;

  for (const warehouse of warehouses) {
    const distanceKm = haversineKm(origin, warehouse);

    if (nearest === null || distanceKm < nearest.distanceKm) {
      nearest = { warehouse, distanceKm };
    }
  }

  return nearest === null
    ? null
    : { warehouse: nearest.warehouse, distanceKm: Math.round(nearest.distanceKm) };
}
