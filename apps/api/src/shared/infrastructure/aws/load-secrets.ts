import {
  GetSecretValueCommand,
  type SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

export const APP_SECRET_KEYS = [
  'PAYMENT_GATEWAY_PRIVATE_KEY',
  'PAYMENT_GATEWAY_INTEGRITY_SECRET',
  'PAYMENT_GATEWAY_EVENTS_SECRET',
  'SMTP_USER',
  'SMTP_PASSWORD',
] as const;

const DB_SECRET_ARN_VAR = 'DB_SECRET_ARN';
const APP_SECRETS_ARN_VAR = 'APP_SECRETS_ARN';

type SecretJson = Record<string, unknown>;

function readSecretField(secret: SecretJson, field: string): string {
  const value = secret[field];

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  throw new Error(`Missing secret field: ${field}`);
}

async function fetchSecretJson(
  client: SecretsManagerClient,
  arnVarName: string,
  env: NodeJS.ProcessEnv,
): Promise<SecretJson> {
  const arn = env[arnVarName];
  if (!arn) {
    throw new Error(`Missing environment variable: ${arnVarName}`);
  }

  const response = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!response.SecretString) {
    throw new Error(`Missing secret value: ${arnVarName}`);
  }

  return JSON.parse(response.SecretString) as SecretJson;
}

// Lambda reuses the same container (and module scope) across invocations, so
// caching the fetch here avoids re-reading Secrets Manager on every request.
let cachedLoad: Promise<void> | null = null;

async function loadSecrets(
  client: SecretsManagerClient,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const dbCredentials = await fetchSecretJson(client, DB_SECRET_ARN_VAR, env);
  env.DB_HOST = readSecretField(dbCredentials, 'host');
  env.DB_PORT = readSecretField(dbCredentials, 'port');
  env.DB_USERNAME = readSecretField(dbCredentials, 'username');
  env.DB_PASSWORD = readSecretField(dbCredentials, 'password');

  const appSecrets = await fetchSecretJson(client, APP_SECRETS_ARN_VAR, env);
  for (const key of APP_SECRET_KEYS) {
    env[key] = readSecretField(appSecrets, key);
  }
}

export async function loadSecretsIntoEnv(
  client: SecretsManagerClient,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (!cachedLoad) {
    cachedLoad = loadSecrets(client, env).catch((error: unknown) => {
      cachedLoad = null;
      throw error;
    });
  }

  return cachedLoad;
}
