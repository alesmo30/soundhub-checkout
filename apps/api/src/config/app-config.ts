import { config as loadDotenvFile } from 'dotenv';

import type {
  DbEnvironmentVariables,
  EnvironmentVariables,
  LogLevel,
  NodeEnv,
} from './environment-variables';
import {
  validateDbEnvironmentVariables,
  validateEnvironmentVariables,
} from './environment-variables';

export interface AppConfig {
  app: { nodeEnv: NodeEnv; port: number; logLevel: LogLevel };
  db: { host: string; port: number; username: string; password: string; name: string };
  paymentGateway: {
    url: string;
    publicKey: string;
    privateKey: string;
    integritySecret: string;
    eventsSecret: string;
  };
  smtp: { host: string; port: number; user: string; password: string; from: string };
}

export function buildAppConfig(env: EnvironmentVariables): AppConfig {
  return {
    app: { nodeEnv: env.NODE_ENV, port: env.PORT, logLevel: env.LOG_LEVEL },
    db: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      name: env.DB_NAME,
    },
    paymentGateway: {
      url: env.PAYMENT_GATEWAY_URL,
      publicKey: env.PAYMENT_GATEWAY_PUBLIC_KEY,
      privateKey: env.PAYMENT_GATEWAY_PRIVATE_KEY,
      integritySecret: env.PAYMENT_GATEWAY_INTEGRITY_SECRET,
      eventsSecret: env.PAYMENT_GATEWAY_EVENTS_SECRET,
    },
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM,
    },
  };
}

// Entry point for code that runs outside Nest's DI (the seed scripts):
// they get no ConfigService, so they validate the single root .env
// themselves. Resolved against process.cwd(), same as ConfigModule.forRoot's
// envFilePath in config.module.ts.
export function loadAppConfig(): AppConfig {
  loadDotenvFile({ path: '../../.env', quiet: true });
  return buildAppConfig(validateEnvironmentVariables(process.env));
}

export interface DbConfig {
  db: AppConfig['db'];
}

export function buildDbConfig(env: DbEnvironmentVariables): DbConfig {
  return {
    db: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      name: env.DB_NAME,
    },
  };
}

// Entry point for the TypeORM CLI and integration tests: they only ever
// open a DataSource, so this validates just the db group. The CI job that
// runs test:int sets no paymentGateway or smtp values (see
// specs/02-api-app-foundation.md, Decisions > Bootstrap).
export function loadDbConfig(): DbConfig {
  loadDotenvFile({ path: '../../.env', quiet: true });
  return buildDbConfig(validateDbEnvironmentVariables(process.env));
}
