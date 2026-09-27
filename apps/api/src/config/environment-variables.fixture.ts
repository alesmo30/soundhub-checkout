import { EnvironmentVariables, validateEnvironmentVariables } from './environment-variables';

export const VALID_ENV_RECORD: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'debug',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'checkout',
  DB_PASSWORD: 'checkout',
  DB_NAME: 'checkout',
  PAYMENT_GATEWAY_URL: 'https://gateway.example.com/v1',
  PAYMENT_GATEWAY_PUBLIC_KEY: 'pub_test',
  PAYMENT_GATEWAY_PRIVATE_KEY: 'priv_test',
  PAYMENT_GATEWAY_INTEGRITY_SECRET: 'integrity_test',
  PAYMENT_GATEWAY_EVENTS_SECRET: 'events_test',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'no-reply@example.com',
  SMTP_PASSWORD: 'smtp_test',
  EMAIL_FROM: 'SoundHub <no-reply@example.com>',
};

export function buildValidEnvironmentVariables(
  overrides: Partial<Record<string, string>> = {},
): EnvironmentVariables {
  return validateEnvironmentVariables({ ...VALID_ENV_RECORD, ...overrides });
}
