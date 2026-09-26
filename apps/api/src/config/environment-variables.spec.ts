import { validateEnvironmentVariables } from './environment-variables';
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

  it('fails fast, naming every missing variable', () => {
    const incomplete = Object.fromEntries(
      Object.entries(VALID_ENV_RECORD).filter(([key]) => key !== 'DB_HOST' && key !== 'SMTP_HOST'),
    );

    expect(() => validateEnvironmentVariables(incomplete)).toThrow(
      /DB_HOST.*SMTP_HOST|SMTP_HOST.*DB_HOST/,
    );
  });
});
