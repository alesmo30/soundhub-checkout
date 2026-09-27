import type {
  ApiResponse,
  Department,
  Municipality,
  ProblemDetails,
} from '@checkout/shared/contracts';

import { env } from '@/config/env';

describe('locations handlers', () => {
  it('lists departments', async () => {
    const response = await fetch(`${env.apiBaseUrl}/locations/departments`);
    const body = (await response.json()) as ApiResponse<Department[]>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(expect.arrayContaining([{ code: '05', name: 'Antioquia' }]));
  });

  it('lists municipalities for a known department', async () => {
    const response = await fetch(`${env.apiBaseUrl}/locations/departments/05/municipalities`);
    const body = (await response.json()) as ApiResponse<Municipality[]>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.arrayContaining([{ code: '05001', name: 'Medellín', isMetroArea: true }]),
    );
  });

  it('returns 404 DEPARTMENT_NOT_FOUND for an unknown department', async () => {
    const response = await fetch(`${env.apiBaseUrl}/locations/departments/99/municipalities`);
    const body = (await response.json()) as ProblemDetails;

    expect(response.status).toBe(404);
    expect(body.code).toBe('DEPARTMENT_NOT_FOUND');
  });
});
