import { EARTH_RADIUS_KM } from './locations.constants';
import type { GeoPoint } from './geo-point';

const HALF = 2;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two points, unrounded. The single rounding
 * point is `findNearestWarehouse`, which matches the `distance_km integer`
 * column.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);

  const haversine =
    Math.sin(deltaLatitude / HALF) ** HALF +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / HALF) ** HALF;
  const angularDistance = HALF * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return EARTH_RADIUS_KM * angularDistance;
}
