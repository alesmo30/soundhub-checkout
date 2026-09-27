import dataSource from './data-source';

export default async function globalSetup(): Promise<void> {
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
