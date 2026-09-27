import type { Response } from 'express';
import type { DataSource } from 'typeorm';

import { HealthController } from './health.controller';

function fakeDataSource(query: DataSource['query']): DataSource {
  return { query } as unknown as DataSource;
}

function fakeResponse(): { status: jest.Mock; asResponse: Response } {
  const status = jest.fn();
  return { status, asResponse: { status } as unknown as Response };
}

describe('HealthController', () => {
  it('reports database up and status 200 when the query succeeds', async () => {
    const dataSource = fakeDataSource(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    const controller = new HealthController(dataSource);
    const response = fakeResponse();

    const body = await controller.check(response.asResponse);

    expect(body).toEqual({ data: { status: 'ok', database: 'up' } });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('reports database down and status 503 when the query fails', async () => {
    const dataSource = fakeDataSource(jest.fn().mockRejectedValue(new Error('connection refused')));
    const controller = new HealthController(dataSource);
    const response = fakeResponse();

    const body = await controller.check(response.asResponse);

    expect(body).toEqual({ data: { status: 'ok', database: 'down' } });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
