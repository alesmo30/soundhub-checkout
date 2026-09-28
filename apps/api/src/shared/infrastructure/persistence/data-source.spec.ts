import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AppConfig } from '../../../config/app-config';
import { buildDataSourceOptions } from './data-source';

function buildAppConfig(dbOverrides: Partial<AppConfig['db']> = {}): AppConfig {
  return {
    app: { nodeEnv: 'test', port: 3000, logLevel: 'error' },
    db: {
      host: 'db-host',
      port: 5433,
      username: 'user',
      password: 'pass',
      name: 'checkout',
      ssl: false,
      ...dbOverrides,
    },
    paymentGateway: {
      url: 'https://gateway.example.com',
      publicKey: 'pub',
      privateKey: 'priv',
      integritySecret: 'secret',
      eventsSecret: 'events',
    },
    smtp: {
      host: 'smtp.example.com',
      port: 465,
      user: 'user',
      password: 'pass',
      from: 'from@example.com',
    },
  };
}

describe('buildDataSourceOptions', () => {
  it('maps AppConfig.db into a postgres DataSourceOptions with synchronize off', () => {
    const options = buildDataSourceOptions(buildAppConfig());

    expect(options).toMatchObject({
      type: 'postgres',
      host: 'db-host',
      port: 5433,
      username: 'user',
      password: 'pass',
      database: 'checkout',
      synchronize: false,
    });
    expect(Array.isArray(options.entities) && options.entities.length).toBeGreaterThan(0);
  });

  it('omits the ssl key entirely when db.ssl is false', () => {
    const options = buildDataSourceOptions(buildAppConfig({ ssl: false }));

    expect(options).not.toHaveProperty('ssl');
  });

  it('sets ssl with the RDS CA bundle and rejectUnauthorized when db.ssl is true', () => {
    const options = buildDataSourceOptions(buildAppConfig({ ssl: true }));
    const expectedCa = readFileSync(
      join(__dirname, '../../../../certs/rds-global-bundle.pem'),
      'utf8',
    );

    expect(options).toMatchObject({
      ssl: { ca: expectedCa, rejectUnauthorized: true },
    });
  });
});
