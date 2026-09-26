import { DataSource, type DataSourceOptions } from 'typeorm';

import type { AppConfig } from '../../../config/app-config';
import { loadAppConfig } from '../../../config/app-config';
import { ProductOrmEntity } from '../../../modules/catalog/infrastructure/persistence/product.orm-entity';
import { CustomerOrmEntity } from '../../../modules/customers/infrastructure/persistence/customer.orm-entity';
import { MunicipalityOrmEntity } from '../../../modules/locations/infrastructure/persistence/municipality.orm-entity';
import { WarehouseOrmEntity } from '../../../modules/locations/infrastructure/persistence/warehouse.orm-entity';

const MIGRATIONS_GLOB = 'src/shared/infrastructure/persistence/migrations/*.ts';

const ENTITIES = [ProductOrmEntity, MunicipalityOrmEntity, WarehouseOrmEntity, CustomerOrmEntity];

// Used by the running Nest app: no `migrations` entry, because a webpack
// bundle cannot resolve that glob at runtime (it tries to on DataSource
// initialization, even though the app itself never runs migrations).
export function buildDataSourceOptions(appConfig: AppConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: appConfig.db.host,
    port: appConfig.db.port,
    username: appConfig.db.username,
    password: appConfig.db.password,
    database: appConfig.db.name,
    synchronize: false,
    entities: ENTITIES,
  };
}

// Entry point for the TypeORM CLI (migration:run/revert/generate), run
// through tsx: it needs its own AppConfig, since Nest's DI isn't running,
// and the migrations glob, which only the CLI ever reads.
export default new DataSource({
  ...buildDataSourceOptions(loadAppConfig()),
  migrations: [MIGRATIONS_GLOB],
});
