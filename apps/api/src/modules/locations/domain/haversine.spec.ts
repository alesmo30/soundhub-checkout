import { haversineKm } from './haversine';
import type { GeoPoint } from './geo-point';

const MEDELLIN: GeoPoint = { latitude: 6.2442, longitude: -75.5812 };
const BOGOTA: GeoPoint = { latitude: 4.711, longitude: -74.0721 };
const CALI: GeoPoint = { latitude: 3.4516, longitude: -76.532 };
const CARTAGENA: GeoPoint = { latitude: 10.391, longitude: -75.4794 };

describe('haversineKm', () => {
  it('returns ~240 km between Medellín and Bogotá', () => {
    expect(haversineKm(MEDELLIN, BOGOTA)).toBeGreaterThanOrEqual(235);
    expect(haversineKm(MEDELLIN, BOGOTA)).toBeLessThanOrEqual(245);
  });

  it('returns ~300 km between Bogotá and Cali', () => {
    expect(haversineKm(BOGOTA, CALI)).toBeGreaterThanOrEqual(280);
    expect(haversineKm(BOGOTA, CALI)).toBeLessThanOrEqual(320);
  });

  it('returns ~455 km between Medellín and Cartagena', () => {
    expect(haversineKm(MEDELLIN, CARTAGENA)).toBeGreaterThanOrEqual(435);
    expect(haversineKm(MEDELLIN, CARTAGENA)).toBeLessThanOrEqual(475);
  });

  it('returns 0 for the same point', () => {
    expect(haversineKm(BOGOTA, BOGOTA)).toBe(0);
  });

  it('returns an unrounded value', () => {
    expect(Number.isInteger(haversineKm(MEDELLIN, BOGOTA))).toBe(false);
  });
});
