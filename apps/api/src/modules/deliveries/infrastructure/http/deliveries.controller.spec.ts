import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DeliveryView, ProblemDetails } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import request from 'supertest';

import { configureApp } from '../../../../shared/infrastructure/http/configure-app';
import { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import { GetDeliveryUseCase } from '../../application/use-cases/get-delivery.use-case';
import { DeliveriesController } from './deliveries.controller';

const KNOWN_DELIVERY_ID = '77777777-7777-4777-8777-777777777777';
const UNKNOWN_DELIVERY_ID = '88888888-8888-4888-8888-888888888888';

function asProblem(body: unknown): ProblemDetails {
  return body as ProblemDetails;
}

function asViewBody(body: unknown): { data: DeliveryView } {
  return body as { data: DeliveryView };
}

function buildDeliveryView(overrides: Partial<DeliveryView> = {}): DeliveryView {
  return {
    id: KNOWN_DELIVERY_ID,
    transactionId: '99999999-9999-4999-8999-999999999999',
    status: 'READY_TO_SHIP',
    warehouse: {
      id: 'warehouse-1',
      name: 'Bodega Medellín',
      municipalityName: 'Medellín',
    },
    destination: {
      recipientName: 'Ana Pérez',
      addressLine: 'Cra 43A # 1-50',
      addressDetail: null,
      municipalityName: 'Bogotá',
      departmentName: 'Cundinamarca',
    },
    distanceKm: 12,
    feeRule: 'NATIONAL_DISTANCE',
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

// This spec's only concern is the HTTP layer (status, headers, envelope);
// GetDeliveryUseCase's own branches are proven at the use-case level
// (references/coding-conventions.md#c3).
class FakeGetDeliveryUseCase {
  constructor(
    private readonly result: ResultAsync<DeliveryView, DomainError> = okAsync(buildDeliveryView()),
  ) {}

  execute(): ResultAsync<DeliveryView, DomainError> {
    return this.result;
  }
}

async function buildApp(
  getDeliveryUseCase: FakeGetDeliveryUseCase = new FakeGetDeliveryUseCase(),
): Promise<{ app: INestApplication; server: Server }> {
  const moduleRef = await Test.createTestingModule({
    controllers: [DeliveriesController],
    providers: [{ provide: GetDeliveryUseCase, useValue: getDeliveryUseCase }],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, server: app.getHttpServer() as Server };
}

describe('DeliveriesController', () => {
  let apps: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps = [];
  });

  async function build(getDeliveryUseCase?: FakeGetDeliveryUseCase) {
    const built = await buildApp(getDeliveryUseCase);
    apps.push(built.app);
    return built;
  }

  describe('GET /deliveries/:id', () => {
    it('returns 200 with Cache-Control: no-store and the DeliveryView envelope', async () => {
      const { server } = await build();

      const response = await request(server).get(`/api/v1/deliveries/${KNOWN_DELIVERY_ID}`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = asViewBody(response.body);
      expect(body.data.warehouse.name).toBe('Bodega Medellín');
      expect(body.data.destination.municipalityName).toBe('Bogotá');
      expect(body.data.destination.departmentName).toBe('Cundinamarca');
    });

    it('returns 400 VALIDATION_ERROR for a non-uuid id', async () => {
      const { server } = await build();

      const response = await request(server).get('/api/v1/deliveries/not-a-uuid');

      expect(response.status).toBe(400);
      expect(asProblem(response.body).code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 404 DELIVERY_NOT_FOUND for an unknown id, with no Cache-Control: no-store', async () => {
      const notFound = new DomainError(
        ErrorCode.DELIVERY_NOT_FOUND,
        'NOT_FOUND',
        `Delivery ${UNKNOWN_DELIVERY_ID} not found`,
      );
      const { server } = await build(new FakeGetDeliveryUseCase(errAsync(notFound)));

      const response = await request(server).get(`/api/v1/deliveries/${UNKNOWN_DELIVERY_ID}`);

      expect(response.status).toBe(404);
      expect(asProblem(response.body).code).toBe('DELIVERY_NOT_FOUND');
      expect(response.headers['cache-control']).toBeUndefined();
    });
  });
});
