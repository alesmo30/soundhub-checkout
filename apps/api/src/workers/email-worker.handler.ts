// Coverage-excluded bootstrap file (see jest.config.ts's
// coveragePathIgnorePatterns): Lambda container wiring, exercised by a real
// invocation (this spec's step 8 manual test), not by unit tests.
import 'reflect-metadata';

import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { SQSHandler } from 'aws-lambda';

import { loadSecretsIntoEnv } from '../shared/infrastructure/aws/load-secrets';
import { SendTransactionEmailUseCase } from '../modules/notifications';
import { processBatch } from './email-worker';

// The Nest application context and its DataSource are reused across
// invocations of the same container, same pattern as reconciler.handler.ts,
// so cold-start work (secret fetch, Nest context creation) runs at most once
// per container.
let cachedContext: Promise<INestApplicationContext> | undefined;

async function bootstrap(): Promise<INestApplicationContext> {
  // Deliberate exception to C2 (env read only inside config/): this is the
  // one production call site that populates process.env from Secrets
  // Manager before anything else reads it; every other file keeps reading
  // the typed config instead.
  // eslint-disable-next-line no-restricted-syntax
  await loadSecretsIntoEnv(new SecretsManagerClient({}), process.env);

  // Deferred until after the secrets are in process.env: AppModule statically
  // imports data-source.ts, whose module-level DataSource construction reads
  // DB_HOST/DB_USERNAME/DB_PASSWORD from process.env as soon as the module is
  // evaluated. A top-level `import` would hoist that evaluation above the
  // loadSecretsIntoEnv call and fail cold start before secrets are fetched.
  const { AppModule } = await import('../app.module');
  return NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
}

export const handler: SQSHandler = async (event) => {
  cachedContext ??= bootstrap();
  const app = await cachedContext;

  const useCase = app.get(SendTransactionEmailUseCase);
  return processBatch(event, useCase);
};
