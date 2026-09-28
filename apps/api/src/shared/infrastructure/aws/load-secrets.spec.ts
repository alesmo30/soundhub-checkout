import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import type { loadSecretsIntoEnv as LoadSecretsIntoEnv } from './load-secrets';

const DB_CREDENTIALS = {
  host: 'db.internal',
  port: 5432,
  username: 'checkout_app',
  password: 'super-secret-password',
  dbname: 'checkout',
  engine: 'postgres',
};

const APP_SECRETS = {
  PAYMENT_GATEWAY_PRIVATE_KEY: 'private-key-value',
  PAYMENT_GATEWAY_INTEGRITY_SECRET: 'integrity-secret-value',
  PAYMENT_GATEWAY_EVENTS_SECRET: 'events-secret-value',
  SMTP_USER: 'smtp-user-value',
  SMTP_PASSWORD: 'smtp-password-value',
};

type FakeSend = jest.Mock<Promise<{ SecretString?: string }>, [{ input: { SecretId: string } }]>;

function fakeSend(secrets: Record<string, unknown>): FakeSend {
  return jest.fn((command: { input: { SecretId: string } }) => {
    const body = secrets[command.input.SecretId];
    if (body === undefined) {
      throw new Error(`no fake secret registered for ${command.input.SecretId}`);
    }
    return Promise.resolve({ SecretString: JSON.stringify(body) });
  });
}

function clientFromSend(send: FakeSend): SecretsManagerClient {
  return { send } as unknown as SecretsManagerClient;
}

function buildEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DB_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:db-credentials',
    APP_SECRETS_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:app-secrets',
    ...overrides,
  };
}

function loadModule(): { loadSecretsIntoEnv: typeof LoadSecretsIntoEnv } {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./load-secrets') as { loadSecretsIntoEnv: typeof LoadSecretsIntoEnv };
}

describe('loadSecretsIntoEnv', () => {
  it('maps both secrets into the documented .env names', async () => {
    const { loadSecretsIntoEnv } = loadModule();
    const env = buildEnv();
    const send = fakeSend({
      [env.DB_SECRET_ARN as string]: DB_CREDENTIALS,
      [env.APP_SECRETS_ARN as string]: APP_SECRETS,
    });

    await loadSecretsIntoEnv(clientFromSend(send), env);

    expect(env).toMatchObject({
      DB_HOST: 'db.internal',
      DB_PORT: '5432',
      DB_USERNAME: 'checkout_app',
      DB_PASSWORD: 'super-secret-password',
      PAYMENT_GATEWAY_PRIVATE_KEY: 'private-key-value',
      PAYMENT_GATEWAY_INTEGRITY_SECRET: 'integrity-secret-value',
      PAYMENT_GATEWAY_EVENTS_SECRET: 'events-secret-value',
      SMTP_USER: 'smtp-user-value',
      SMTP_PASSWORD: 'smtp-password-value',
    });
  });

  it('throws naming a missing ARN environment variable', async () => {
    const { loadSecretsIntoEnv } = loadModule();
    const env = buildEnv({ DB_SECRET_ARN: undefined });
    const send = fakeSend({});

    await expect(loadSecretsIntoEnv(clientFromSend(send), env)).rejects.toThrow(
      'Missing environment variable: DB_SECRET_ARN',
    );
  });

  it('throws naming the ARN variable when the fetched secret has no SecretString', async () => {
    const { loadSecretsIntoEnv } = loadModule();
    const env = buildEnv();
    const send: FakeSend = jest.fn((command: { input: { SecretId: string } }) => {
      void command;
      return Promise.resolve({});
    });

    await expect(loadSecretsIntoEnv(clientFromSend(send), env)).rejects.toThrow(
      'Missing secret value: DB_SECRET_ARN',
    );
  });

  it('throws naming a missing field in db-credentials, without leaking any value', async () => {
    const { loadSecretsIntoEnv } = loadModule();
    const env = buildEnv();
    const dbCredentialsWithoutHost = {
      port: DB_CREDENTIALS.port,
      username: DB_CREDENTIALS.username,
      password: DB_CREDENTIALS.password,
      dbname: DB_CREDENTIALS.dbname,
      engine: DB_CREDENTIALS.engine,
    };
    const send = fakeSend({
      [env.DB_SECRET_ARN as string]: dbCredentialsWithoutHost,
      [env.APP_SECRETS_ARN as string]: APP_SECRETS,
    });

    let caughtError: unknown;
    try {
      await loadSecretsIntoEnv(clientFromSend(send), env);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = (caughtError as Error).message;
    expect(message).toBe('Missing secret field: host');
    expect(message).not.toContain(DB_CREDENTIALS.password);
    expect(message).not.toContain(DB_CREDENTIALS.username);
  });

  it('throws naming a missing app-secret key, without leaking any value', async () => {
    const { loadSecretsIntoEnv } = loadModule();
    const env = buildEnv();
    const appSecretsWithoutSmtpPassword = {
      PAYMENT_GATEWAY_PRIVATE_KEY: APP_SECRETS.PAYMENT_GATEWAY_PRIVATE_KEY,
      PAYMENT_GATEWAY_INTEGRITY_SECRET: APP_SECRETS.PAYMENT_GATEWAY_INTEGRITY_SECRET,
      PAYMENT_GATEWAY_EVENTS_SECRET: APP_SECRETS.PAYMENT_GATEWAY_EVENTS_SECRET,
      SMTP_USER: APP_SECRETS.SMTP_USER,
    };
    const send = fakeSend({
      [env.DB_SECRET_ARN as string]: DB_CREDENTIALS,
      [env.APP_SECRETS_ARN as string]: appSecretsWithoutSmtpPassword,
    });

    let caughtError: unknown;
    try {
      await loadSecretsIntoEnv(clientFromSend(send), env);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = (caughtError as Error).message;
    expect(message).toBe('Missing secret field: SMTP_PASSWORD');
    expect(message).not.toContain(APP_SECRETS.PAYMENT_GATEWAY_PRIVATE_KEY);
  });

  it('does not fetch again on a second call in the same process', async () => {
    const { loadSecretsIntoEnv } = loadModule();
    const env = buildEnv();
    const send = fakeSend({
      [env.DB_SECRET_ARN as string]: DB_CREDENTIALS,
      [env.APP_SECRETS_ARN as string]: APP_SECRETS,
    });
    const client = clientFromSend(send);

    await loadSecretsIntoEnv(client, env);
    await loadSecretsIntoEnv(client, env);

    expect(send).toHaveBeenCalledTimes(2);
  });
});
