import { HttpResponse, http } from 'msw';
import type { ApiResponse, Department, Municipality } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';

import { departments, municipalitiesByDepartment } from '../fixtures/locations';
import { problem } from '../problem';

export const locationsHandlers = [
  http.get('*/api/v1/locations/departments', () => {
    const body: ApiResponse<Department[]> = { data: departments };

    return HttpResponse.json(body);
  }),

  http.get('*/api/v1/locations/departments/:code/municipalities', ({ params }) => {
    const municipalities = municipalitiesByDepartment[params.code as string];

    if (!municipalities) {
      return HttpResponse.json(
        problem(404, ErrorCode.DEPARTMENT_NOT_FOUND, 'Department not found'),
        {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    }

    const body: ApiResponse<Municipality[]> = { data: municipalities };

    return HttpResponse.json(body);
  }),
];
