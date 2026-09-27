import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Department, Municipality, ProblemDetails } from '@checkout/shared/contracts';
import { okAsync } from 'neverthrow';
import request from 'supertest';

import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import type { ResultAsync } from '../../../../shared/domain/result';
import type { MunicipalityRepository } from '../../application/ports/municipality.repository.port';
import { MUNICIPALITY_REPOSITORY } from '../../application/ports/municipality.repository.port';
import { ListDepartmentsUseCase } from '../../application/use-cases/list-departments.use-case';
import { ListMunicipalitiesUseCase } from '../../application/use-cases/list-municipalities.use-case';
import type { Municipality as MunicipalityEntity } from '../../domain/municipality';
import { LocationsController } from './locations.controller';

const DEPARTMENTS: Department[] = [
  { code: '05', name: 'Antioquia' },
  { code: '11', name: 'Bogotá D.C.' },
];

const ANTIOQUIA_MUNICIPALITIES: MunicipalityEntity[] = [
  {
    code: '05001',
    name: 'Medellín',
    departmentCode: '05',
    departmentName: 'Antioquia',
    latitude: 6.2442,
    longitude: -75.5812,
    isMetroArea: true,
  },
];

class FakeMunicipalityRepository implements MunicipalityRepository {
  constructor(
    private readonly departments: Department[],
    private readonly byDepartment: Record<string, MunicipalityEntity[]>,
  ) {}

  listDepartments(): ResultAsync<Department[], never> {
    return okAsync(this.departments);
  }

  listByDepartment(departmentCode: string): ResultAsync<MunicipalityEntity[], never> {
    return okAsync(this.byDepartment[departmentCode] ?? []);
  }

  findByCode(code: string): ResultAsync<MunicipalityEntity | null, never> {
    const municipality = Object.values(this.byDepartment)
      .flat()
      .find((candidate) => candidate.code === code);

    return okAsync(municipality ?? null);
  }
}

function asProblem(body: unknown): ProblemDetails {
  return body as ProblemDetails;
}

function asDepartmentsBody(body: unknown): { data: Department[] } {
  return body as { data: Department[] };
}

function asMunicipalitiesBody(body: unknown): { data: Municipality[] } {
  return body as { data: Municipality[] };
}

describe('LocationsController', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const fakeRepository = new FakeMunicipalityRepository(DEPARTMENTS, {
      '05': ANTIOQUIA_MUNICIPALITIES,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [LocationsController],
      providers: [
        ListDepartmentsUseCase,
        ListMunicipalitiesUseCase,
        { provide: MUNICIPALITY_REPOSITORY, useValue: fakeRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /locations/departments', () => {
    it('returns the { data } envelope sorted as given by the repository', async () => {
      const response = await request(server).get('/api/v1/locations/departments');
      const body = asDepartmentsBody(response.body);

      expect(response.status).toBe(200);
      expect(body.data).toEqual(DEPARTMENTS);
    });

    it('sets the locations Cache-Control header on 200', async () => {
      const response = await request(server).get('/api/v1/locations/departments');

      expect(response.headers['cache-control']).toBe('public, max-age=86400');
    });
  });

  describe('GET /locations/departments/:code/municipalities', () => {
    it('returns the { data } envelope with isMetroArea', async () => {
      const response = await request(server).get('/api/v1/locations/departments/05/municipalities');
      const body = asMunicipalitiesBody(response.body);

      expect(response.status).toBe(200);
      expect(body.data).toEqual([{ code: '05001', name: 'Medellín', isMetroArea: true }]);
    });

    it('sets the locations Cache-Control header on 200', async () => {
      const response = await request(server).get('/api/v1/locations/departments/05/municipalities');

      expect(response.headers['cache-control']).toBe('public, max-age=86400');
    });

    it.each(['abc', '5', '123'])('returns 400 with errors[] for code=%s', async (code) => {
      const response = await request(server).get(
        `/api/v1/locations/departments/${code}/municipalities`,
      );
      const problem = asProblem(response.body);

      expect(response.status).toBe(400);
      expect(problem.code).toBe('VALIDATION_ERROR');
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'code' })]),
      );
    });

    it.each(['abc', '5', '123'])(
      'does not set the Cache-Control header on a 400 for code=%s',
      async (code) => {
        const response = await request(server).get(
          `/api/v1/locations/departments/${code}/municipalities`,
        );

        expect(response.headers['cache-control']).toBeUndefined();
      },
    );

    it('returns 404 DEPARTMENT_NOT_FOUND for a well-formed but empty-result code', async () => {
      const response = await request(server).get('/api/v1/locations/departments/99/municipalities');
      const problem = asProblem(response.body);

      expect(response.status).toBe(404);
      expect(problem.code).toBe('DEPARTMENT_NOT_FOUND');
    });

    it('does not set the Cache-Control header on a 404', async () => {
      const response = await request(server).get('/api/v1/locations/departments/99/municipalities');

      expect(response.headers['cache-control']).toBeUndefined();
    });
  });
});
