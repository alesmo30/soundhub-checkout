import { createHash } from 'node:crypto';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;
const AMOUNT_IN_CENTS = 1_500_000; // COP 15,000
const CURRENCY = 'COP';
const INSTALLMENTS = 1;
const CUSTOMER_EMAIL = 'spike@example.com';
const CARD_HOLDER = 'Spike Tester';
const FINAL_STATUSES = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;

type SpikeEnv = {
  gatewayUrl: string;
  publicKey: string;
  privateKey: string;
  integritySecret: string;
};

function readEnv(): SpikeEnv {
  // eslint-disable-next-line no-restricted-syntax -- standalone script has no config module to hold process.env
  const env = process.env;

  const required = {
    PAYMENT_GATEWAY_URL: env.PAYMENT_GATEWAY_URL,
    PAYMENT_GATEWAY_PUBLIC_KEY: env.PAYMENT_GATEWAY_PUBLIC_KEY,
    PAYMENT_GATEWAY_PRIVATE_KEY: env.PAYMENT_GATEWAY_PRIVATE_KEY,
    PAYMENT_GATEWAY_INTEGRITY_SECRET: env.PAYMENT_GATEWAY_INTEGRITY_SECRET,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  return {
    gatewayUrl: required.PAYMENT_GATEWAY_URL!,
    publicKey: required.PAYMENT_GATEWAY_PUBLIC_KEY!,
    privateKey: required.PAYMENT_GATEWAY_PRIVATE_KEY!,
    integritySecret: required.PAYMENT_GATEWAY_INTEGRITY_SECRET!,
  };
}

function collectFieldNames(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? collectFieldNames(value[0], `${prefix}[]`) : [prefix];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    collectFieldNames(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function buildReference(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const suffix = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

  return `TX-${yyyy}${mm}${dd}-${suffix}`;
}

type SignIntegrityInput = {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret: string;
};

function signIntegrity({ reference, amountInCents, currency, integritySecret }: SignIntegrityInput): string {
  return createHash('sha256').update(`${reference}${amountInCents}${currency}${integritySecret}`).digest('hex');
}

async function getAcceptanceTokens(
  env: SpikeEnv,
): Promise<{ status: number; body: unknown; fieldNames: string[] }> {
  const response = await fetch(`${env.gatewayUrl}/merchants/${env.publicKey}`);
  const body = await response.json();

  return { status: response.status, body, fieldNames: collectFieldNames(body) };
}

async function main(): Promise<void> {
  const env = readEnv();

  const merchant = await getAcceptanceTokens(env);
  console.log(`GET /merchants/{publicKey} -> ${merchant.status}`);
  console.log(`Field names: ${merchant.fieldNames.join(', ')}`);

  const reference = buildReference();
  const signature = signIntegrity({ reference, amountInCents: AMOUNT_IN_CENTS, currency: CURRENCY, integritySecret: env.integritySecret });
  console.log(`Sample reference: ${reference}`);
  console.log(`Signature length: ${signature.length}`);
}

main();
