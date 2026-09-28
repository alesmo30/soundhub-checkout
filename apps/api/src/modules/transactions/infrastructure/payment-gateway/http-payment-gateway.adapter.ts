import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CURRENCY } from '@checkout/shared/constants';

import { APP_CONFIG, type AppConfig } from '../../../../config/app-config';
import { err, errAsync, ok, ResultAsync } from '../../../../shared/domain/result';
import type { Result } from '../../../../shared/domain/result';
import { CircuitBreaker } from '../../../../shared/infrastructure/resilience/circuit-breaker';
import { retryWithBackoff } from '../../../../shared/infrastructure/resilience/retry-with-backoff';
import {
  TimeoutError,
  withTimeout,
} from '../../../../shared/infrastructure/resilience/with-timeout';
import { integritySignature } from '../../domain/integrity-signature';
import type {
  CreateChargeRequest,
  GatewayCharge,
  PaymentGatewayError,
  PaymentGatewayPort,
} from '../../application/ports/payment-gateway.port';
import { classifyGatewayError } from './gateway-error.classifier';
import { toGatewayCharge, toGatewayChargeFromReferenceLookup } from './gateway-response.mapper';
import {
  GATEWAY_BREAKER_FAILURE_THRESHOLD,
  GATEWAY_BREAKER_OPEN_MS,
  GATEWAY_GET_RETRY,
  GATEWAY_TIMEOUT_MS,
} from './payment-gateway.constants';

// Thrown only inside this file to carry a classified PaymentGatewayError
// through `CircuitBreaker.execute` (which only distinguishes resolve from
// reject). A 4xx never reaches here — see `toOutcome` — so this always
// represents an outcome that must count as a breaker failure (5xx, a
// network error or a timeout).
class GatewayBreakerFailure extends Error {
  constructor(readonly gatewayError: PaymentGatewayError) {
    super(gatewayError.message);
    this.name = 'GatewayBreakerFailure';
  }
}

function isRetryableGatewayFailure(error: unknown): boolean {
  // Per the spec's Charge/Circuit breaker decisions: only 5xx and network
  // errors are retried. A TIMEOUT already spent GATEWAY_TIMEOUT_MS on one
  // attempt, so retrying it would risk minutes-long GETs.
  return error instanceof GatewayBreakerFailure && error.gatewayError.kind === 'UNAVAILABLE';
}

type GatewayOutcome<T> =
  | { readonly kind: 'ok'; readonly status: number; readonly charge: T }
  | { readonly kind: 'error'; readonly status: number; readonly error: PaymentGatewayError };

// Test-only seams (never bound in a .module.ts — that is step 12's job).
// Production code gets one real CircuitBreaker per process and the real
// GATEWAY_TIMEOUT_MS; unit specs inject a breaker with a controllable
// `now` (CircuitBreakerOptions) and a short `timeoutMs`/`sleep`, matching
// how with-timeout.spec.ts, retry-with-backoff.spec.ts and
// circuit-breaker.spec.ts already test these helpers — never Jest fake
// timers, which this repo avoids everywhere else.
export interface HttpPaymentGatewayAdapterOverrides {
  readonly breaker?: CircuitBreaker;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Anti-corruption adapter over the payment gateway's HTTP API (see
 * docs/design/gateway-findings.md). `createCharge` is never retried — a
 * retry could double-charge, per the spec's Charge decisions — while the
 * two GETs retry on transient failures only. One `CircuitBreaker` per
 * instance backs `ensureAvailable`.
 */
@Injectable()
export class HttpPaymentGatewayAdapter implements PaymentGatewayPort {
  private readonly logger = new Logger(HttpPaymentGatewayAdapter.name);
  private readonly breaker: CircuitBreaker;
  private readonly timeoutMs: number;
  private readonly sleep?: (ms: number) => Promise<void>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() overrides?: HttpPaymentGatewayAdapterOverrides,
  ) {
    this.breaker =
      overrides?.breaker ??
      new CircuitBreaker({
        failureThreshold: GATEWAY_BREAKER_FAILURE_THRESHOLD,
        openDurationMs: GATEWAY_BREAKER_OPEN_MS,
      });
    this.timeoutMs = overrides?.timeoutMs ?? GATEWAY_TIMEOUT_MS;
    this.sleep = overrides?.sleep;
  }

  ensureAvailable(): Result<void, PaymentGatewayError> {
    return this.breaker.canRequest()
      ? ok(undefined)
      : err({ kind: 'UNAVAILABLE', message: 'The payment gateway breaker is open' });
  }

  createCharge(request: CreateChargeRequest): ResultAsync<GatewayCharge, PaymentGatewayError> {
    const availability = this.ensureAvailable();
    if (availability.isErr()) return errAsync(availability.error);

    const signature = integritySignature({
      reference: request.reference,
      amountInCents: request.amountInCents,
      currency: CURRENCY,
      secret: this.config.paymentGateway.integritySecret,
    });

    const body = JSON.stringify({
      amount_in_cents: request.amountInCents,
      currency: CURRENCY,
      customer_email: request.customerEmail,
      reference: request.reference,
      signature,
      payment_method: {
        type: 'CARD',
        token: request.cardToken,
        installments: request.installments,
      },
      acceptance_token: request.acceptanceToken,
      accept_personal_auth: request.personalAuthToken,
    });

    return new ResultAsync(
      this.runGuarded('createCharge', () =>
        this.attempt(
          `${this.config.paymentGateway.url}/transactions`,
          { method: 'POST', headers: this.authHeaders(true), body },
          toGatewayCharge,
        ),
      ),
    );
  }

  getCharge(providerTransactionId: string): ResultAsync<GatewayCharge, PaymentGatewayError> {
    const availability = this.ensureAvailable();
    if (availability.isErr()) return errAsync(availability.error);

    const url = `${this.config.paymentGateway.url}/transactions/${providerTransactionId}`;

    return new ResultAsync(
      this.runGuarded('getCharge', () =>
        retryWithBackoff(
          () => this.attempt(url, { method: 'GET', headers: this.authHeaders() }, toGatewayCharge),
          { ...GATEWAY_GET_RETRY, shouldRetry: isRetryableGatewayFailure, sleep: this.sleep },
        ),
      ),
    );
  }

  findChargeByReference(reference: string): ResultAsync<GatewayCharge | null, PaymentGatewayError> {
    const availability = this.ensureAvailable();
    if (availability.isErr()) return errAsync(availability.error);

    const url = `${this.config.paymentGateway.url}/transactions?reference=${encodeURIComponent(reference)}`;

    return new ResultAsync(
      this.runGuarded('findChargeByReference', () =>
        retryWithBackoff(
          () =>
            this.attempt(
              url,
              { method: 'GET', headers: this.authHeaders() },
              toGatewayChargeFromReferenceLookup,
            ),
          { ...GATEWAY_GET_RETRY, shouldRetry: isRetryableGatewayFailure, sleep: this.sleep },
        ),
      ),
    );
  }

  // Runs `work` and turns every outcome into a Result, so the public
  // methods never reject. The breaker only ever sees a trivial resolved or
  // rejected signal *after* the real outcome is known — never `work`
  // itself — so a 4xx (which `work` resolves, never throws) cannot reach
  // the breaker at all: it is not just "not a failure", it is invisible to
  // it, and can never mask or reset a real streak of 5xx/timeout/network
  // failures. Only status code and elapsed time are logged — never the
  // request body, headers, tokens or signature built above.
  private async runGuarded<T>(
    operation: string,
    work: () => Promise<GatewayOutcome<T>>,
  ): Promise<Result<T, PaymentGatewayError>> {
    const startedAt = Date.now();

    try {
      const outcome = await work();
      if (outcome.kind === 'ok') {
        await this.breaker.execute(() => Promise.resolve()).catch(() => undefined);
      }
      this.logOutcome(operation, outcome.status, Date.now() - startedAt);
      return outcome.kind === 'ok' ? ok(outcome.charge) : err(outcome.error);
    } catch (error) {
      // The breaker only needs to know "this counted as a failure"; the
      // real, classified error is returned separately below via
      // `toPaymentGatewayError`, never through the breaker.
      await this.breaker
        .execute(() => Promise.reject(new Error('payment gateway attempt failed')))
        .catch(() => undefined);
      this.logOutcome(operation, null, Date.now() - startedAt);
      return err(this.toPaymentGatewayError(error));
    }
  }

  private toPaymentGatewayError(error: unknown): PaymentGatewayError {
    return error instanceof GatewayBreakerFailure
      ? error.gatewayError
      : { kind: 'UNAVAILABLE', message: 'The payment gateway request failed unexpectedly' };
  }

  private async attempt<T>(
    url: string,
    init: RequestInit,
    parse: (body: unknown) => T,
  ): Promise<GatewayOutcome<T>> {
    const { status, body } = await this.fetchJson(url, init);
    return this.toOutcome(status, body, parse);
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<{ status: number; body: unknown }> {
    let response: Response;

    try {
      response = await withTimeout((signal) => fetch(url, { ...init, signal }), this.timeoutMs);
    } catch (error) {
      throw error instanceof TimeoutError
        ? new GatewayBreakerFailure({
            kind: 'TIMEOUT',
            message: 'The payment gateway request timed out',
          })
        : new GatewayBreakerFailure({
            kind: 'UNAVAILABLE',
            message: 'The payment gateway is unreachable',
          });
    }

    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  }

  // 2xx resolves; a 4xx resolves too (as a REJECTED outcome) so the breaker
  // never counts it as a failure; a 5xx throws so the breaker does.
  private toOutcome<T>(
    status: number,
    body: unknown,
    parse: (body: unknown) => T,
  ): GatewayOutcome<T> {
    if (status >= 200 && status < 300) {
      return { kind: 'ok', status, charge: parse(body) };
    }
    if (status >= 500) {
      throw new GatewayBreakerFailure(classifyGatewayError(status, body));
    }
    return { kind: 'error', status, error: classifyGatewayError(status, body) };
  }

  private authHeaders(withContentType = false): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.paymentGateway.privateKey}`,
    };
    if (withContentType) headers['Content-Type'] = 'application/json';
    return headers;
  }

  private logOutcome(operation: string, status: number | null, elapsedMs: number): void {
    this.logger.log({ operation, status, elapsedMs });
  }
}
