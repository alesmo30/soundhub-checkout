// Must load before config/app-config.ts: EnvironmentVariables' decorators
// run at module-load time and need Reflect.getMetadata already polyfilled.
import 'reflect-metadata';

import { loadAppConfig } from '../../../../config/app-config';
import dataSource from '../data-source';
import { resetSeedWithManager } from './reset-seed';

async function main(): Promise<void> {
  const appConfig = loadAppConfig();

  await dataSource.initialize();

  try {
    const updated = await dataSource.transaction((manager) =>
      resetSeedWithManager(manager, appConfig.app.nodeEnv),
    );
    console.log(`Reset ${updated} seeded products.`);
  } finally {
    await dataSource.destroy();
  }
}

void main();
