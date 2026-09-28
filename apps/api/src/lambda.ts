// Coverage-excluded bootstrap file (see jest.config.ts's
// coveragePathIgnorePatterns): this is Lambda container wiring, exercised
// by a real invocation (spec step 9's smoke test), not by unit tests.
import 'reflect-metadata';

import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { NestFactory } from '@nestjs/core';
import serverlessExpress from '@codegenie/serverless-express';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context, Handler } from 'aws-lambda';
import type { Application } from 'express';
import { Logger as PinoLogger } from 'nestjs-pino';

import { loadSecretsIntoEnv } from './shared/infrastructure/aws/load-secrets';
import { configureApp } from './shared/infrastructure/http/configure-app';

type ApiHandler = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<APIGatewayProxyResultV2>;

// The Nest app and its DataSource are reused across invocations of the same
// container, so cold-start work (secret fetch, Nest app creation) runs at
// most once per container, not once per request.
let cachedHandler: Promise<ApiHandler> | undefined;

async function bootstrap(): Promise<ApiHandler> {
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
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  configureApp(app);
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance() as Application;
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler<APIGatewayProxyEventV2, APIGatewayProxyResultV2> = async (
  event,
  context,
) => {
  cachedHandler ??= bootstrap();
  const server = await cachedHandler;
  return server(event, context);
};
