import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok without a database check', () => {
    const controller = new HealthController();

    expect(controller.check()).toEqual({ data: { status: 'ok' } });
  });
});
