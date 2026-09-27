export interface EnvSource {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_MOCKING?: string;
  readonly VITE_PAYMENT_GATEWAY_URL?: string;
  readonly VITE_PAYMENT_GATEWAY_PUBLIC_KEY?: string;
  readonly DEV?: boolean;
}

export interface Env {
  apiBaseUrl: string;
  apiMocking: boolean;
  paymentGatewayUrl: string;
  paymentGatewayPublicKey: string;
  isDev: boolean;
}

function requireVariable(source: EnvSource, key: keyof EnvSource): string {
  const value = source[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parseApiMocking(source: EnvSource): boolean {
  const value = requireVariable(source, 'VITE_API_MOCKING');

  if (value !== 'true' && value !== 'false') {
    throw new Error(`Invalid value for VITE_API_MOCKING: expected "true" or "false"`);
  }

  return value === 'true';
}

export function parseEnv(source: EnvSource): Env {
  return {
    apiBaseUrl: requireVariable(source, 'VITE_API_BASE_URL'),
    apiMocking: parseApiMocking(source),
    paymentGatewayUrl: requireVariable(source, 'VITE_PAYMENT_GATEWAY_URL'),
    paymentGatewayPublicKey: requireVariable(source, 'VITE_PAYMENT_GATEWAY_PUBLIC_KEY'),
    isDev: Boolean(source.DEV),
  };
}
