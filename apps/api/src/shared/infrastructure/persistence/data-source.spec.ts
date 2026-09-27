import type { AppConfig } from '../../../config/app-config';
import { buildDataSourceOptions } from './data-source';

describe('buildDataSourceOptions', () => {
  it('maps AppConfig.db into a postgres DataSourceOptions with synchronize off', () => {
    const appConfig: AppConfig = {
      app: { nodeEnv: 'test', port: 3000, logLevel: 'error' },
      db: { host: 'db-host', port: 5433, username: 'user', password: 'pass', name: 'checkout' },
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

    const options = buildDataSourceOptions(appConfig);

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
});
