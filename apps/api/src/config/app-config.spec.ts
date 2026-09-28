import { buildAppConfig } from './app-config';
import { buildValidEnvironmentVariables } from './environment-variables.fixture';

describe('buildAppConfig', () => {
  it('defaults messaging, email and web to memory/log/null', () => {
    const config = buildAppConfig(buildValidEnvironmentVariables());

    expect(config.messaging).toEqual({ driver: 'memory', queueUrl: null });
    expect(config.email).toEqual({ driver: 'log' });
    expect(config.web).toEqual({ publicUrl: null });
  });

  it('carries the sqs queue URL when the driver is sqs', () => {
    const config = buildAppConfig(
      buildValidEnvironmentVariables({
        EVENT_PUBLISHER_DRIVER: 'sqs',
        TRANSACTION_FINALIZED_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789012/queue',
      }),
    );

    expect(config.messaging).toEqual({
      driver: 'sqs',
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/queue',
    });
  });

  it('trims the trailing slash off PUBLIC_WEB_URL', () => {
    const config = buildAppConfig(
      buildValidEnvironmentVariables({ PUBLIC_WEB_URL: 'http://localhost:5173/' }),
    );

    expect(config.web.publicUrl).toBe('http://localhost:5173');
  });

  it('leaves a PUBLIC_WEB_URL with no trailing slash untouched', () => {
    const config = buildAppConfig(
      buildValidEnvironmentVariables({ PUBLIC_WEB_URL: 'http://localhost:5173' }),
    );

    expect(config.web.publicUrl).toBe('http://localhost:5173');
  });
});
