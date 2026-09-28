import { Logger } from '@nestjs/common';
import { CURRENCY } from '@checkout/shared/constants';

import type { AppConfig } from '../../../../config/app-config';
import { CircuitBreaker } from '../../../../shared/infrastructure/resilience/circuit-breaker';
import { integritySignature } from '../../domain/integrity-signature';
import type { CreateChargeRequest } from '../../application/ports/payment-gateway.port';
import byReferenceEmpty from './__fixtures__/by-reference-empty.json';
import byReferenceOne from './__fixtures__/by-reference-one.json';
import create422InvalidToken from './__fixtures__/create-422-invalid-token.json';
import createPending from './__fixtures__/create-pending.json';
import { HttpPaymentGatewayAdapter } from './http-payment-gateway.adapter';
import {
  GATEWAY_BREAKER_FAILURE_THRESHOLD,
  GATEWAY_BREAKER_OPEN_MS,
  GATEWAY_GET_RETRY,
} from './payment-gateway.constants';

const PRIVATE_KEY = 'sk_fake_private_00000000000000000000';
const INTEGRITY_SECRET = 'integrity_fake_secret_00000000000000';
const GATEWAY_URL = 'https://gateway.example.test';
const CARD_TOKEN = 'tok_fake_card_00000000000000000000';
const ACCEPTANCE_TOKEN = 'acc_fake_token_00000000000000000000';
const PERSONAL_AUTH_TOKEN = 'auth_fake_token_00000000000000000000';

// Real waits with no fake timers, per this repo's own convention (see
// with-timeout.spec.ts / retry-with-backoff.spec.ts / circuit-breaker.spec.ts):
// the breaker gets an injected `now`, and retries/timeouts get a tiny
// `timeoutMs`/`sleep` override instead of a real 8s or fake-timer wait.
const TEST_TIMEOUT_MS = 20;
const noSleep = (): Promise<void> => Promise.resolve();

function buildConfig(): AppConfig {
  return {
    app: { nodeEnv: 'test', port: 3000, logLevel: 'error' },
    db: {
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'pass',
      name: 'db',
      ssl: false,
    },
    paymentGateway: {
      url: GATEWAY_URL,
      publicKey: 'pub_fake_00000000000000000000',
      privateKey: PRIVATE_KEY,
      integritySecret: INTEGRITY_SECRET,
      eventsSecret: 'events_fake_00000000000000000000',
    },
    smtp: { host: 'smtp', port: 587, user: 'user', password: 'pass', from: 'from@example.test' },
    messaging: { driver: 'memory', queueUrl: null },
    email: { driver: 'log' },
    web: { publicUrl: null },
  };
}

function buildRequest(overrides: Partial<CreateChargeRequest> = {}): CreateChargeRequest {
  return {
    reference: 'TX-20260927-FAKE01',
    amountInCents: 20_000_000,
    customerEmail: 'buyer@example.test',
    installments: 1,
    cardToken: CARD_TOKEN,
    acceptanceToken: ACCEPTANCE_TOKEN,
    personalAuthToken: PERSONAL_AUTH_TOKEN,
    ...overrides,
  };
}

function makeResponse(status: number, body: unknown): Response {
  return { status, json: () => Promise.resolve(body) } as unknown as Response;
}

function mockFetch(): jest.Mock {
  const fetchMock = jest.fn();
  global.fetch = fetchMock;
  return fetchMock;
}

describe('HttpPaymentGatewayAdapter', () => {
  beforeEach(() => {
    // Silences the adapter's own status/elapsed-time logging in every test
    // but the dedicated logging spec below, which re-spies to inspect it.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createCharge', () => {
    it('sends the signature, private key, both acceptance tokens, email, installments and token', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(201, createPending));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig());
      const request = buildRequest();

      const result = await adapter.createCharge(request);

      expect(result.isOk()).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${GATEWAY_URL}/transactions`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        Authorization: `Bearer ${PRIVATE_KEY}`,
        'Content-Type': 'application/json',
      });

      const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(sentBody).toEqual({
        amount_in_cents: request.amountInCents,
        currency: CURRENCY,
        customer_email: request.customerEmail,
        reference: request.reference,
        signature: integritySignature({
          reference: request.reference,
          amountInCents: request.amountInCents,
          currency: CURRENCY,
          secret: INTEGRITY_SECRET,
        }),
        payment_method: {
          type: 'CARD',
          token: request.cardToken,
          installments: request.installments,
        },
        acceptance_token: request.acceptanceToken,
        accept_personal_auth: request.personalAuthToken,
      });
    });

    it('is never retried on a 5xx', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(500, {}));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig());

      const result = await adapter.createCharge(buildRequest());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result._unsafeUnwrapErr()).toEqual({
        kind: 'UNAVAILABLE',
        message: 'The payment gateway is unavailable',
      });
    });

    it('is never retried on a network error', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig());

      const result = await adapter.createCharge(buildRequest());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result._unsafeUnwrapErr().kind).toBe('UNAVAILABLE');
    });

    it('maps a 4xx to a REJECTED error without retrying', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(422, create422InvalidToken));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig());

      const result = await adapter.createCharge(buildRequest());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result._unsafeUnwrapErr()).toEqual({
        kind: 'REJECTED',
        message: 'The token field is not valid',
      });
    });
  });

  describe('GET retries', () => {
    it('retries getCharge on 5xx up to GATEWAY_GET_RETRY.retries, then succeeds', async () => {
      const fetchMock = mockFetch();
      fetchMock
        .mockResolvedValueOnce(makeResponse(500, {}))
        .mockResolvedValueOnce(makeResponse(500, {}))
        .mockResolvedValueOnce(makeResponse(200, createPending));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig(), { sleep: noSleep });

      const result = await adapter.getCharge('fake-txn-00000001');

      expect(fetchMock).toHaveBeenCalledTimes(1 + GATEWAY_GET_RETRY.retries);
      expect(result.isOk()).toBe(true);
    });

    it('exhausts retries and returns UNAVAILABLE when every attempt is a 5xx', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(503, {}));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig(), { sleep: noSleep });

      const result = await adapter.getCharge('fake-txn-00000001');

      expect(fetchMock).toHaveBeenCalledTimes(1 + GATEWAY_GET_RETRY.retries);
      expect(result._unsafeUnwrapErr().kind).toBe('UNAVAILABLE');
    });

    it('does not retry getCharge on a 4xx', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(404, { error: { type: 'NOT_FOUND' } }));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig(), { sleep: noSleep });

      const result = await adapter.getCharge('unknown-id');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result._unsafeUnwrapErr().kind).toBe('REJECTED');
    });

    it('does not retry findChargeByReference on a 4xx', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(401, {}));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig(), { sleep: noSleep });

      const result = await adapter.findChargeByReference('TX-20260927-FAKE01');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result._unsafeUnwrapErr().kind).toBe('REJECTED');
    });

    it('findChargeByReference resolves the first match from the array response', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(200, byReferenceOne));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig());

      const result = await adapter.findChargeByReference('TX-20260927-FAKE01');

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe(`${GATEWAY_URL}/transactions?reference=TX-20260927-FAKE01`);
      expect(result._unsafeUnwrap()).not.toBeNull();
    });

    it('findChargeByReference resolves null for an empty array response', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(200, byReferenceEmpty));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig());

      const result = await adapter.findChargeByReference('TX-20260927-NONE00');

      expect(result._unsafeUnwrap()).toBeNull();
    });
  });

  describe('timeout', () => {
    it('maps a hang past timeoutMs to TIMEOUT', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockImplementation(() => new Promise<never>(() => {}));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig(), { timeoutMs: TEST_TIMEOUT_MS });

      const result = await adapter.createCharge(buildRequest());

      expect(result._unsafeUnwrapErr().kind).toBe('TIMEOUT');
    });
  });

  describe('circuit breaker', () => {
    it('opens after 5 consecutive failures, then half-opens once openDurationMs has elapsed', async () => {
      let now = 0;
      const breaker = new CircuitBreaker({
        failureThreshold: GATEWAY_BREAKER_FAILURE_THRESHOLD,
        openDurationMs: GATEWAY_BREAKER_OPEN_MS,
        now: () => now,
      });
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(500, {}));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig(), { breaker });

      for (let i = 0; i < GATEWAY_BREAKER_FAILURE_THRESHOLD; i += 1) {
        // Sequential on purpose: each failure must be observed before the
        // next, to build up the breaker's count deterministically.
        await adapter.createCharge(buildRequest());
      }

      expect(fetchMock).toHaveBeenCalledTimes(GATEWAY_BREAKER_FAILURE_THRESHOLD);
      expect(adapter.ensureAvailable()._unsafeUnwrapErr()).toEqual({
        kind: 'UNAVAILABLE',
        message: 'The payment gateway breaker is open',
      });

      // A further call is short-circuited by the open breaker: no fetch call,
      // on every port method, not just createCharge.
      const blocked = await adapter.createCharge(buildRequest());
      expect(blocked._unsafeUnwrapErr().kind).toBe('UNAVAILABLE');
      const blockedGet = await adapter.getCharge('fake-txn-00000001');
      expect(blockedGet._unsafeUnwrapErr().kind).toBe('UNAVAILABLE');
      const blockedLookup = await adapter.findChargeByReference('TX-20260927-FAKE01');
      expect(blockedLookup._unsafeUnwrapErr().kind).toBe('UNAVAILABLE');
      expect(fetchMock).toHaveBeenCalledTimes(GATEWAY_BREAKER_FAILURE_THRESHOLD);

      now += GATEWAY_BREAKER_OPEN_MS;
      expect(adapter.ensureAvailable().isOk()).toBe(true);
    });

    it('does not count 4xx responses toward the breaker', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: GATEWAY_BREAKER_FAILURE_THRESHOLD,
        openDurationMs: GATEWAY_BREAKER_OPEN_MS,
      });
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(422, create422InvalidToken));
      const adapter = new HttpPaymentGatewayAdapter(buildConfig(), { breaker });

      for (let i = 0; i < GATEWAY_BREAKER_FAILURE_THRESHOLD + 2; i += 1) {
        // Sequential 4xxs, same reasoning as above.
        await adapter.createCharge(buildRequest());
      }

      expect(fetchMock).toHaveBeenCalledTimes(GATEWAY_BREAKER_FAILURE_THRESHOLD + 2);
      expect(adapter.ensureAvailable().isOk()).toBe(true);
    });

    it('a 4xx interleaved with 5xx failures does not reset the failure count', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: GATEWAY_BREAKER_FAILURE_THRESHOLD,
        openDurationMs: GATEWAY_BREAKER_OPEN_MS,
      });
      const fetchMock = mockFetch();
      const adapter = new HttpPaymentGatewayAdapter(buildConfig(), { breaker });

      fetchMock.mockResolvedValue(makeResponse(500, {}));
      await adapter.createCharge(buildRequest());
      await adapter.createCharge(buildRequest());

      fetchMock.mockResolvedValue(makeResponse(422, create422InvalidToken));
      await adapter.createCharge(buildRequest());

      fetchMock.mockResolvedValue(makeResponse(500, {}));
      await adapter.createCharge(buildRequest());
      await adapter.createCharge(buildRequest());

      // 4 real failures (the 4xx in between never touched the breaker), one
      // short of the threshold: still available.
      expect(adapter.ensureAvailable().isOk()).toBe(true);

      await adapter.createCharge(buildRequest());

      expect(adapter.ensureAvailable().isErr()).toBe(true);
    });
  });

  describe('logging never leaks secrets', () => {
    it('logs only non-sensitive metadata across success, 4xx, 5xx, timeout and network-error branches', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const request = buildRequest();
      const signature = integritySignature({
        reference: request.reference,
        amountInCents: request.amountInCents,
        currency: CURRENCY,
        secret: INTEGRITY_SECRET,
      });

      // Success
      let fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(201, createPending));
      await new HttpPaymentGatewayAdapter(buildConfig()).createCharge(request);

      // 4xx
      fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(422, create422InvalidToken));
      await new HttpPaymentGatewayAdapter(buildConfig()).createCharge(request);

      // 5xx
      fetchMock = mockFetch();
      fetchMock.mockResolvedValue(makeResponse(500, {}));
      await new HttpPaymentGatewayAdapter(buildConfig()).createCharge(request);

      // Timeout
      fetchMock = mockFetch();
      fetchMock.mockImplementation(() => new Promise<never>(() => {}));
      await new HttpPaymentGatewayAdapter(buildConfig(), {
        timeoutMs: TEST_TIMEOUT_MS,
      }).createCharge(request);

      // Network error
      fetchMock = mockFetch();
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await new HttpPaymentGatewayAdapter(buildConfig()).createCharge(request);

      const logged = logSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
      expect(logged.length).toBeGreaterThan(0);
      expect(logged).not.toContain(PRIVATE_KEY);
      expect(logged).not.toContain(INTEGRITY_SECRET);
      expect(logged).not.toContain(CARD_TOKEN);
      expect(logged).not.toContain(ACCEPTANCE_TOKEN);
      expect(logged).not.toContain(PERSONAL_AUTH_TOKEN);
      expect(logged).not.toContain(signature);
    });
  });
});
