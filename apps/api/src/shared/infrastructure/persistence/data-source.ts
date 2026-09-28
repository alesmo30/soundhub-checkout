// Idempotent: safe even when the Nest app already imported it in main.ts.
// Standalone CLI entry points (migration/seed scripts) import this module
// directly, sometimes before anything else polyfills it, and decorators on
// EnvironmentVariables/the ORM entities need Reflect.getMetadata at
// module-load time, before any of our own code runs.
import 'reflect-metadata';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import pg from 'pg';
import { DataSource, type DataSourceOptions } from 'typeorm';

import type { DbConfig } from '../../../config/app-config';
import { loadDbConfig } from '../../../config/app-config';
import { ProductOrmEntity } from '../../../modules/catalog/infrastructure/persistence/product.orm-entity';
import { CustomerOrmEntity } from '../../../modules/customers/infrastructure/persistence/customer.orm-entity';
import { MunicipalityOrmEntity } from '../../../modules/locations/infrastructure/persistence/municipality.orm-entity';
import { WarehouseOrmEntity } from '../../../modules/locations/infrastructure/persistence/warehouse.orm-entity';
import { DeliveryOrmEntity } from '../../../modules/deliveries/infrastructure/persistence/delivery.orm-entity';
import { TransactionOrmEntity } from '../../../modules/transactions/infrastructure/persistence/transaction.orm-entity';

const MIGRATIONS_GLOB = 'src/shared/infrastructure/persistence/migrations/*.ts';

// Two candidates because __dirname means different things depending on how
// this module is loaded: unbundled (tsx from src/, 4 levels below apps/api)
// vs. the Lambda webpack bundle, which flattens every module into one file
// living directly in dist-lambda/ (see copy-lambda-assets.ts, which copies
// the cert next to it).
const RDS_CA_BUNDLE_CANDIDATES = [
  join(__dirname, '../../../../certs/rds-global-bundle.pem'),
  join(__dirname, 'certs/rds-global-bundle.pem'),
];

function resolveRdsCaBundlePath(): string {
  const found = RDS_CA_BUNDLE_CANDIDATES.find(existsSync);
  if (!found) {
    throw new Error('rds-global-bundle.pem not found next to data-source.ts or in dist-lambda/certs');
  }
  return found;
}

const ENTITIES = [
  ProductOrmEntity,
  MunicipalityOrmEntity,
  WarehouseOrmEntity,
  CustomerOrmEntity,
  TransactionOrmEntity,
  DeliveryOrmEntity,
];

// Used by the running Nest app: no `migrations` entry, because a webpack
// bundle cannot resolve that glob at runtime (it tries to on DataSource
// initialization, even though the app itself never runs migrations). Takes
// only the `db` group (the full AppConfig satisfies this too) so callers
// that only ever open a DataSource — the CLI, integration tests — never
// need to validate paymentGateway/smtp values.
export function buildDataSourceOptions(config: DbConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.db.host,
    port: config.db.port,
    username: config.db.username,
    password: config.db.password,
    database: config.db.name,
    synchronize: false,
    entities: ENTITIES,
    // Passed explicitly instead of leaving TypeORM's PostgresDriver fall back
    // to its own `PlatformTools.load('pg')`: that call is a dynamic
    // `require(name)`, which a webpack bundle (dist-lambda) cannot resolve —
    // there is no node_modules inside the Lambda zip for it to find at
    // runtime. A real static `import pg from 'pg'` bundles correctly and
    // sidesteps the dynamic lookup entirely, for both the bundled and the
    // unbundled (local, ts-node/tsx) code paths.
    driver: pg,
    ...(config.db.ssl && {
      ssl: { ca: readFileSync(resolveRdsCaBundlePath(), 'utf8'), rejectUnauthorized: true },
    }),
  };
}

// Entry point for the TypeORM CLI (migration:run/revert/generate) and
// integration tests, run through tsx: neither has Nest's DI, and neither
// needs paymentGateway/smtp values, only a DataSource.
export default new DataSource({
  ...buildDataSourceOptions(loadDbConfig()),
  migrations: [MIGRATIONS_GLOB],
});
