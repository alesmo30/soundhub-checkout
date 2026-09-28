// Coverage-excluded bootstrap file (see jest.config.ts's
// coveragePathIgnorePatterns): this runs migrations and the seed against a
// real database, exercised by the deploy pipeline (spec step 10's
// triggers.Trigger), not by unit tests.
import 'reflect-metadata';

import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { Handler } from 'aws-lambda';
import { DataSource } from 'typeorm';

import { loadDbConfig } from '../config/app-config';
import { loadSecretsIntoEnv } from '../shared/infrastructure/aws/load-secrets';
import { InitialSchema1790463118000 } from '../shared/infrastructure/persistence/migrations/1790463118000-initial-schema';
import type { SeedSummary } from '../shared/infrastructure/persistence/seeds/run-seed';
import { runSeed } from '../shared/infrastructure/persistence/seeds/run-seed';

export interface MigratorSummary {
  migrationsRun: number;
  seed: SeedSummary;
}

async function runMigrator(): Promise<MigratorSummary> {
  // Deliberate exception to C2 (env read only inside config/): this is the
  // one production call site that populates process.env from Secrets
  // Manager before anything else reads it; every other file keeps reading
  // the typed config instead.
  // eslint-disable-next-line no-restricted-syntax
  await loadSecretsIntoEnv(new SecretsManagerClient({}), process.env);

  // Deferred until after the secrets are in process.env, same reason as
  // lambda.ts. This DataSource also passes its own `migrations` array
  // instead of reusing data-source.ts's glob-based resolution: the `*.ts`
  // glob does not exist inside a webpack bundle, so the migrator imports the
  // migration classes explicitly by name.
  const { buildDataSourceOptions } = await import(
    '../shared/infrastructure/persistence/data-source'
  );

  const dataSource = new DataSource({
    ...buildDataSourceOptions(loadDbConfig()),
    migrations: [InitialSchema1790463118000],
  });

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    const seed = await runSeed(dataSource);
    return { migrationsRun: migrations.length, seed };
  } finally {
    await dataSource.destroy();
  }
}

export const handler: Handler = async () => runMigrator();
