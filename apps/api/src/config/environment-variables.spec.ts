import {
  validateDbEnvironmentVariables,
  validateEnvironmentVariables,
} from './environment-variables';
import { buildValidEnvironmentVariables, VALID_ENV_RECORD } from './environment-variables.fixture';

describe('validateEnvironmentVariables', () => {
  it('returns a validated, transformed instance for a complete environment', () => {
    const env = buildValidEnvironmentVariables();

    expect(env.DB_HOST).toBe(VALID_ENV_RECORD.DB_HOST);
    expect(env.PORT).toBe(3000);
  });

  it('rejects an out-of-range value', () => {
    expect(() => buildValidEnvironmentVariables({ DB_PORT: '999999' })).toThrow(/DB_PORT/);
  });

  it('defaults DB_SSL to false when unset', () => {
    const env = buildValidEnvironmentVariables();

    expect(env.DB_SSL).toBe('false');
  });

  it('accepts an explicit DB_SSL of true', () => {
    const env = buildValidEnvironmentVariables({ DB_SSL: 'true' });

    expect(env.DB_SSL).toBe('true');
  });

  it('rejects a DB_SSL value that is neither true nor false', () => {
    expect(() => buildValidEnvironmentVariables({ DB_SSL: 'yes' })).toThrow(/DB_SSL/);
  });

  it('defaults EVENT_PUBLISHER_DRIVER to memory, EMAIL_DRIVER to log, PUBLIC_WEB_URL to unset', () => {
    const env = buildValidEnvironmentVariables();

    expect(env.EVENT_PUBLISHER_DRIVER).toBe('memory');
    expect(env.EMAIL_DRIVER).toBe('log');
    expect(env.PUBLIC_WEB_URL).toBeUndefined();
  });

  it('rejects EVENT_PUBLISHER_DRIVER=sqs without TRANSACTION_FINALIZED_QUEUE_URL', () => {
    expect(() =>
      buildValidEnvironmentVariables({ EVENT_PUBLISHER_DRIVER: 'sqs' }),
    ).toThrow(/TRANSACTION_FINALIZED_QUEUE_URL/);
  });

  it('accepts EVENT_PUBLISHER_DRIVER=sqs with a queue URL', () => {
    const env = buildValidEnvironmentVariables({
      EVENT_PUBLISHER_DRIVER: 'sqs',
      TRANSACTION_FINALIZED_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789012/queue',
    });

    expect(env.EVENT_PUBLISHER_DRIVER).toBe('sqs');
  });

  it('rejects an invalid EVENT_PUBLISHER_DRIVER value', () => {
    expect(() => buildValidEnvironmentVariables({ EVENT_PUBLISHER_DRIVER: 'kafka' })).toThrow(
      /EVENT_PUBLISHER_DRIVER/,
    );
  });

  it('rejects an invalid EMAIL_DRIVER value', () => {
    expect(() => buildValidEnvironmentVariables({ EMAIL_DRIVER: 'carrier-pigeon' })).toThrow(
      /EMAIL_DRIVER/,
    );
  });

  it('accepts a localhost PUBLIC_WEB_URL', () => {
    const env = buildValidEnvironmentVariables({ PUBLIC_WEB_URL: 'http://localhost:5173' });

    expect(env.PUBLIC_WEB_URL).toBe('http://localhost:5173');
  });

  it('fails fast, naming every missing variable', () => {
    const incomplete = Object.fromEntries(
      Object.entries(VALID_ENV_RECORD).filter(([key]) => key !== 'DB_HOST' && key !== 'SMTP_HOST'),
    );

    expect(() => validateEnvironmentVariables(incomplete)).toThrow(
      /DB_HOST.*SMTP_HOST|SMTP_HOST.*DB_HOST/,
    );
  });
});

describe('validateDbEnvironmentVariables', () => {
  const DB_ONLY_RECORD = {
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USERNAME: 'checkout',
    DB_PASSWORD: 'checkout',
    DB_NAME: 'checkout',
  };

  it('passes with only the db group, no paymentGateway or smtp values', () => {
    // The api-integration CI job (migration:run, test:int) sets exactly
    // these 5 vars and nothing else — see specs/02-api-app-foundation.md,
    // Decisions > Bootstrap.
    const env = validateDbEnvironmentVariables(DB_ONLY_RECORD);

    expect(env.DB_HOST).toBe('localhost');
    expect(env.DB_PORT).toBe(5432);
  });

  it('fails fast, naming every missing db variable', () => {
    expect(() => validateDbEnvironmentVariables({})).toThrow(
      /DB_HOST.*DB_PORT.*DB_USERNAME.*DB_PASSWORD.*DB_NAME/,
    );
  });
});
