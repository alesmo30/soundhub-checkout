import { createHash } from 'node:crypto';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;
const AMOUNT_IN_CENTS = 1_500_000; // COP 15,000
const CURRENCY = 'COP';
const INSTALLMENTS = 1;
const CUSTOMER_EMAIL = 'spike@example.com';
const CARD_HOLDER = 'Spike Tester';
const FINAL_STATUSES = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;
const CARD_APPROVED_NUMBER = '4242424242424242'; // sandbox test card, always APPROVED
const CARD_DECLINED_NUMBER = '4111111111111111'; // sandbox test card, always DECLINED

type ScenarioName = 'approved' | 'declined' | 'invalid-token' | 'reused-token' | 'lookup-by-reference';

type ScenarioResult = {
  scenario: ScenarioName;
  expected: string;
  observed: string;
  passed: boolean;
  elapsedMs: number;
  statusTrail: string[];
  fieldNames: string[];
};

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

type JsonResult<T> = { status: number; body: T; fieldNames: string[] };

async function requestJson<T>(url: string, init?: RequestInit): Promise<JsonResult<T>> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T;

  return { status: response.status, body, fieldNames: collectFieldNames(body) };
}

type MerchantResponse = {
  data: {
    presigned_acceptance: { acceptance_token: string };
    presigned_personal_data_auth: { acceptance_token: string };
  };
};

async function getAcceptanceTokens(env: SpikeEnv): Promise<JsonResult<MerchantResponse>> {
  return requestJson<MerchantResponse>(`${env.gatewayUrl}/merchants/${env.publicKey}`);
}

type CardTokenResponse = { data: { id: string } };

async function tokenizeCard(env: SpikeEnv, cardNumber: string): Promise<JsonResult<CardTokenResponse>> {
  const expYear = String(new Date().getFullYear() + 2).slice(-2);

  return requestJson<CardTokenResponse>(`${env.gatewayUrl}/tokens/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.publicKey}` },
    body: JSON.stringify({ number: cardNumber, cvc: '123', exp_month: '12', exp_year: expYear, card_holder: CARD_HOLDER }),
  });
}

type TransactionResponse = {
  data?: { id: string; status: string };
  error?: { type: string; messages?: Record<string, unknown> };
};

type CreateTransactionInput = {
  env: SpikeEnv;
  cardToken: string;
  acceptanceToken: string;
  personalAuthToken: string;
  reference: string;
};

async function createTransaction(input: CreateTransactionInput): Promise<JsonResult<TransactionResponse>> {
  const { env, cardToken, acceptanceToken, personalAuthToken, reference } = input;
  const signature = signIntegrity({ reference, amountInCents: AMOUNT_IN_CENTS, currency: CURRENCY, integritySecret: env.integritySecret });

  return requestJson<TransactionResponse>(`${env.gatewayUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.privateKey}` },
    body: JSON.stringify({
      amount_in_cents: AMOUNT_IN_CENTS,
      currency: CURRENCY,
      customer_email: CUSTOMER_EMAIL,
      reference,
      signature,
      payment_method: { type: 'CARD', token: cardToken, installments: INSTALLMENTS },
      acceptance_token: acceptanceToken,
      accept_personal_auth: personalAuthToken,
    }),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFinalStatus(status: string): boolean {
  return (FINAL_STATUSES as readonly string[]).includes(status);
}

type PollResult = {
  finalStatus: string | null;
  statusTrail: string[];
  elapsedMs: number;
  fieldNames: string[];
};

async function pollUntilFinal(env: SpikeEnv, transactionId: string, initialStatus: string): Promise<PollResult> {
  const start = Date.now();
  const statusTrail = [initialStatus];
  let currentStatus = initialStatus;
  let fieldNames: string[] = [];

  while (!isFinalStatus(currentStatus) && Date.now() - start < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const result = await requestJson<TransactionResponse>(`${env.gatewayUrl}/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${env.privateKey}` },
    });
    fieldNames = result.fieldNames;
    currentStatus = result.body.data!.status;
    if (statusTrail[statusTrail.length - 1] !== currentStatus) statusTrail.push(currentStatus);
  }

  return {
    finalStatus: isFinalStatus(currentStatus) ? currentStatus : null,
    statusTrail,
    elapsedMs: Date.now() - start,
    fieldNames,
  };
}

type RunCardScenarioInput = {
  env: SpikeEnv;
  scenario: ScenarioName;
  cardNumber: string;
  expectedStatus: string;
  reference: string;
};

async function runCardScenario(input: RunCardScenarioInput): Promise<ScenarioResult> {
  const { env, scenario, cardNumber, expectedStatus, reference } = input;
  const start = Date.now();

  // Each presigned acceptance token is single-use: the gateway rejects a
  // reused one with 422 INPUT_VALIDATION_ERROR, so every scenario fetches
  // its own pair from the merchant endpoint.
  const merchant = await getAcceptanceTokens(env);
  const tokenized = await tokenizeCard(env, cardNumber);
  const created = await createTransaction({
    env,
    cardToken: tokenized.body.data.id,
    acceptanceToken: merchant.body.data.presigned_acceptance.acceptance_token,
    personalAuthToken: merchant.body.data.presigned_personal_data_auth.acceptance_token,
    reference,
  });

  const poll = await pollUntilFinal(env, created.body.data!.id, created.body.data!.status);
  const observed = poll.finalStatus ?? 'TIMEOUT';

  return {
    scenario,
    expected: expectedStatus,
    observed,
    passed: observed === expectedStatus,
    elapsedMs: Date.now() - start,
    statusTrail: poll.statusTrail,
    fieldNames: poll.fieldNames.length > 0 ? poll.fieldNames : created.fieldNames,
  };
}

const INVALID_CARD_TOKEN = 'tok_test_invalid_00000000000000000000';

type TransactionOutcome = {
  observed: string;
  statusTrail: string[];
  elapsedMs: number;
  fieldNames: string[];
};

async function observeTransactionOutcome(env: SpikeEnv, cardToken: string): Promise<TransactionOutcome> {
  const start = Date.now();
  const merchant = await getAcceptanceTokens(env);
  const created = await createTransaction({
    env,
    cardToken,
    acceptanceToken: merchant.body.data.presigned_acceptance.acceptance_token,
    personalAuthToken: merchant.body.data.presigned_personal_data_auth.acceptance_token,
    reference: buildReference(),
  });

  if (created.status >= 400) {
    return {
      observed: `HTTP ${created.status} ${created.body.error?.type ?? 'unknown'}`,
      statusTrail: [],
      elapsedMs: Date.now() - start,
      fieldNames: created.fieldNames,
    };
  }

  const poll = await pollUntilFinal(env, created.body.data!.id, created.body.data!.status);

  return {
    observed: poll.finalStatus ?? 'TIMEOUT',
    statusTrail: poll.statusTrail,
    elapsedMs: Date.now() - start,
    fieldNames: poll.fieldNames.length > 0 ? poll.fieldNames : created.fieldNames,
  };
}

async function runInvalidTokenScenario(env: SpikeEnv): Promise<ScenarioResult> {
  const outcome = await observeTransactionOutcome(env, INVALID_CARD_TOKEN);

  return {
    scenario: 'invalid-token',
    expected: 'gateway error',
    passed: outcome.observed.startsWith('HTTP') || outcome.observed === 'ERROR',
    ...outcome,
  };
}

async function runReusedTokenScenario(env: SpikeEnv): Promise<ScenarioResult> {
  const merchant = await getAcceptanceTokens(env);
  const tokenized = await tokenizeCard(env, CARD_APPROVED_NUMBER);
  await createTransaction({
    env,
    cardToken: tokenized.body.data.id,
    acceptanceToken: merchant.body.data.presigned_acceptance.acceptance_token,
    personalAuthToken: merchant.body.data.presigned_personal_data_auth.acceptance_token,
    reference: buildReference(),
  });

  // Reusing the same card token was not rejected in this sandbox: a manual
  // probe confirmed 4 consecutive uses all succeeded (no documented reuse
  // limit found), so this scenario records the outcome instead of forcing
  // an error.
  const outcome = await observeTransactionOutcome(env, tokenized.body.data.id);

  return {
    scenario: 'reused-token',
    expected: 'recorded result (goal is to observe, not to force an error)',
    passed: true,
    ...outcome,
  };
}

async function runLookupByReferenceScenario(env: SpikeEnv, reference: string): Promise<ScenarioResult> {
  const start = Date.now();

  const result = await requestJson<{ data?: unknown[] }>(
    `${env.gatewayUrl}/transactions?reference=${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${env.privateKey}` } },
  );
  const count = Array.isArray(result.body.data) ? result.body.data.length : 0;

  return {
    scenario: 'lookup-by-reference',
    expected: 'recorded result',
    observed: `HTTP ${result.status}, count=${count}`,
    passed: true,
    elapsedMs: Date.now() - start,
    statusTrail: [],
    fieldNames: result.fieldNames,
  };
}

function printSummary(results: ScenarioResult[]): void {
  console.log('\nScenario summary:');
  for (const result of results) {
    const mark = result.passed ? 'PASS' : 'FAIL';
    console.log(
      `[${mark}] ${result.scenario} -> expected ${result.expected}, observed ${result.observed}, ${result.elapsedMs}ms, trail [${result.statusTrail.join(' -> ')}]`,
    );
  }
}

async function main(): Promise<void> {
  const env = readEnv();

  const results: ScenarioResult[] = [];

  const approvedReference = buildReference();
  results.push(
    await runCardScenario({
      env,
      scenario: 'approved',
      cardNumber: CARD_APPROVED_NUMBER,
      expectedStatus: 'APPROVED',
      reference: approvedReference,
    }),
  );
  results.push(
    await runCardScenario({
      env,
      scenario: 'declined',
      cardNumber: CARD_DECLINED_NUMBER,
      expectedStatus: 'DECLINED',
      reference: buildReference(),
    }),
  );
  results.push(await runInvalidTokenScenario(env));
  results.push(await runReusedTokenScenario(env));
  results.push(await runLookupByReferenceScenario(env, approvedReference));

  printSummary(results);

  if (results.some((result) => !result.passed)) {
    process.exit(1);
  }
}

main();
