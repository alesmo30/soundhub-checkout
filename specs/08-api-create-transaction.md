# SPEC 08 — API: create transaction (reserve, charge, safe retry)

> **Status:** Approved
> **Depends on:** SPEC 02 (frozen ports, `UnitOfWork`, resilience helpers), SPEC 04 (product, municipality and warehouse repositories), SPEC 06 (blocking: `GetQuoteUseCase` and the customer repository must be merged first), SPEC 00 (gateway findings)
> **Date:** 2026-09-27
> **Objective:** `POST /api/v1/transactions` turns a verified quote into a PENDING transaction with reserved stock and an AWAITING_PAYMENT delivery, charges the card token through the payment gateway after the commit, and is safe to retry: no double charge, no oversell.

> Source phase file: `phases/saturday/api/04-payment.1-create-transaction.md`.

## Scope

**In:**

Contract change (separate PR, step 1)

- `TransactionRepository.insert` returns `Err(TransactionUniqueViolation)` with `constraint: 'IDEMPOTENCY_KEY' | 'REFERENCE'` instead of `never`. Nothing else in the port changes.

Endpoint

- `POST /api/v1/transactions` per `02-api-contracts.md`: 201 + `Location: /api/v1/transactions/{id}` + `Cache-Control: no-store`, body `{ data: TransactionCreated }`.
- `Idempotency-Key` header: required, uuid v4, otherwise 400 `MISSING_IDEMPOTENCY_KEY`.
- Request DTOs with nested `payment` / `delivery` (`@ValidateNested`), built from the `@checkout/shared` limits and patterns. Unknown fields return 400.
- A response DTO that `implements TransactionCreated`, documented in Swagger.

`CreateTransactionUseCase` — `execute()` reads as a table of contents of private phases

1. **Idempotency lookup.** `request_hash` = SHA-256 of the canonical (recursively key-sorted) validated body, payment tokens included. Same key + same hash → replay the stored transaction in its **current** state, 201 + `Idempotent-Replayed: true`, no gateway call. Same key + different hash → 422 `IDEMPOTENCY_KEY_REUSED`.
2. **Guard.** Circuit breaker open → 503 `PAYMENT_GATEWAY_UNAVAILABLE` + `Retry-After: 30`. Nothing is created.
3. **Quote & verify.** Unknown customer → 422 `CUSTOMER_NOT_FOUND`. `GetQuoteUseCase` errors pass through (422 product / municipality, 409 `OUT_OF_STOCK`). Total ≠ `expectedTotalInCents` → 409 `PRICE_CHANGED`.
4. **Reserve (one `UnitOfWork`).**
   - Raw SQL reserve; 0 rows → 409 `OUT_OF_STOCK`.
   - Insert the transaction: PENDING, price and fee snapshots, card brand and last 4, `reservation_expires_at = now + RESERVATION_TTL_MS`.
   - Insert the delivery: AWAITING_PAYMENT, nearest warehouse, distance, fee rule.
   - Unique violation on the idempotency key (concurrent duplicate) → the unit of work rolls back, then the lookup is re-read and replayed.
   - Unique violation on the reference → regenerate and retry the whole unit of work, up to 3 attempts.
5. **Charge (after commit, never inside the DB transaction).** Gateway `createCharge` with the customer's email.
   - Gateway 201 → store `provider_transaction_id` and stay PENDING, even when the charge already reports a final status.
   - Gateway 4xx (definitive) → finalize as `ERROR` with `statusMessage` (stock released, delivery `CANCELLED`), still 201.
   - 5xx, network error or 8 s timeout (uncertain) → stay PENDING with no `provider_transaction_id`. The reconciler resolves it by reference (api 06).

Minimal finalizer

- `FinalizeTransactionUseCase`, **release branch only** (`ERROR`, and by extension DECLINED / VOIDED / EXPIRED), in one `UnitOfWork`: `transactions.finalize` → `stock.release` → `deliveries.transition(CANCELLED)`.
- No event publishing and no APPROVED branch (both api 04.2).

Domain

- Reference `TX-YYYYMMDD-XXXXXX`: the date in `America/Bogota` (fixed UTC−5), 6 uppercase alphanumerics. A pure function with an injected clock and randomness.
- Canonical request hash as a pure function.
- Error factories for the new codes.

Adapters

- **Payment gateway** (`transactions/infrastructure/payment-gateway/`), all 4 port methods, through global `fetch`:
  - 8 s timeout; retries only on the two GETs; integrity signature `SHA256(reference + amountInCents + currency + integritySecret)`;
  - circuit breaker: 5 consecutive failures open it for 30 s, and only 5xx, network errors and timeouts count;
  - anti-corruption mapping of provider statuses and error shapes;
  - defensive parsing: extra fields ignored, `three_ds_auth` optional, the by-reference lookup is an array;
  - never logs bodies, headers, tokens or keys.
- **`TypeOrmTransactionRepository`**:
  - `insert`, `findById`, `findByIdempotencyKey`, `recordGatewayResponse`, and `finalize` (raw SQL `UPDATE … WHERE status = 'PENDING' RETURNING`);
  - `claimPendingForSync`, `claimExpiredReservations`, `findUnsentEmails` and `markEmailSent` throw `Error('Not implemented — api 06')`.
- **Stock reservation adapter** in `catalog/infrastructure/persistence/`: `reserve`, `release` and `commit`, all raw SQL.
- **`TypeOrmDeliveryRepository`** in `deliveries/infrastructure/persistence/`: all 4 methods.

Wiring

- `TransactionsModule`: controller, use cases, adapters. It imports `CatalogModule`, `PricingModule`, `CustomersModule` and `DeliveriesModule`.
- `UNIT_OF_WORK` and `CLOCK` bound to `TypeOrmUnitOfWork` and a new `SystemClock`, unless SPEC 06 already bound them.

Tests

- Unit: every branch of every phase with fake ports.
- Adapter: `fetch` mocked, hand-written fixtures in `__fixtures__/` shaped after `gateway-findings.md`.
- Integration:
  - reserve / release / commit SQL;
  - 20 concurrent reservations of 1 unit → exactly 1 succeeds, with the test product soft-deleted in a `finally`;
  - finalize idempotency;
  - the idempotency-key unique race.
- Controller spec (`configureApp` + supertest + fakes): status codes, headers, 400s, and 5 replays → 1 transaction + 1 gateway call.

**Out of scope (for future specs):**

- `GET /transactions/:id`, gateway status sync, the APPROVED finalization branch, the `transaction.finalized` event and `EventPublisher` (api 04.2).
- `GET /deliveries/:id` as an endpoint (api 04.2).
- Webhook, reconciler, reservation expiry, SQS, email, and the 4 stubbed repository methods (api 06).
- Rate limiting of `POST /transactions` (api 07).
- The frontend's idempotency-key policy (new key per "Pagar" click, same key on automatic retries), which belongs to the web spec.
- Deleting or soft-deleting transactions or deliveries. They are financial records.
- Any new dependency in `apps/api/package.json` (infra 05 edits it in parallel).
- Any change to `packages/shared`, the other frozen ports, the ORM entities, migrations, `GetQuoteUseCase`, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.

## Data model

This spec adds no tables, columns or migrations. It reuses the SPEC 02 schema, ORM entities and domain types, and the frozen ports as amended by step 1.

### New files

```
apps/api/src/
├─ shared/infrastructure/time/system-clock.ts           SystemClock implements Clock (only if SPEC 06 did not add one)
├─ modules/transactions/
│  ├─ application/ports/transaction.repository.port.ts  ~ insert → Err(TransactionUniqueViolation)   (step 1, separate PR)
│  ├─ index.ts                                          + FinalizeTransactionUseCase
│  ├─ transactions.module.ts                            imports Catalog, Pricing, Customers, Deliveries · providers · controller
│  ├─ domain/
│  │  transactions.constants.ts · transaction.errors.ts
│  │  transaction-reference.ts · request-hash.ts · integrity-signature.ts
│  ├─ application/use-cases/
│  │  create-transaction.use-case.ts · finalize-transaction.use-case.ts
│  │  helpers/to-transaction-created.ts
│  └─ infrastructure/
│     ├─ payment-gateway/
│     │  http-payment-gateway.adapter.ts · payment-gateway.constants.ts
│     │  gateway-response.mapper.ts · gateway-error.classifier.ts
│     │  __fixtures__/{create-pending, create-422-invalid-token, create-401,
│     │                get-approved, get-declined, get-three-ds-empty,
│     │                by-reference-one, by-reference-empty}.json
│     ├─ persistence/
│     │  transaction.mapper.ts · typeorm-transaction.repository.ts (+ .int-spec.ts)
│     │  helpers/to-transaction-unique-violation.ts
│     │  create-transaction.concurrency.int-spec.ts
│     └─ http/
│        transactions.controller.ts (+ .spec.ts, + .logging.spec.ts)
│        transactions-http.constants.ts · idempotency-key.pipe.ts
│        dto/{create-transaction, payment-input, delivery-input,
│             transaction-created, transaction-created-response}.dto.ts
├─ modules/catalog/
│  ├─ catalog.module.ts                                 + STOCK_RESERVATION provider + export
│  └─ infrastructure/persistence/
│     typeorm-stock-reservation.repository.ts (+ .int-spec.ts, + .concurrency.int-spec.ts)
└─ modules/deliveries/
   ├─ deliveries.module.ts                              forFeature · DELIVERY_REPOSITORY provider + export
   └─ infrastructure/persistence/
      delivery.mapper.ts · typeorm-delivery.repository.ts (+ .int-spec.ts)
```

Unit specs (`*.spec.ts`) sit next to every domain file, use case, adapter and helper.

### Contract change (step 1)

```ts
// transactions/application/ports/transaction.repository.port.ts
export interface TransactionUniqueViolation {
  readonly constraint: 'IDEMPOTENCY_KEY' | 'REFERENCE';  // transactions_idempotency_key_key | transactions_reference_key
}

insert(tx: TxContext, transaction: NewTransaction): ResultAsync<Transaction, TransactionUniqueViolation>;
// Every other method is unchanged.
```

### Constants

```ts
// transactions/domain/transactions.constants.ts
export const REFERENCE_PREFIX = 'TX';
export const REFERENCE_RANDOM_LENGTH = 6;
export const REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const REFERENCE_UTC_OFFSET_HOURS = -5;         // America/Bogota, no DST
export const REFERENCE_MAX_ATTEMPTS = 3;

// transactions/infrastructure/payment-gateway/payment-gateway.constants.ts
export const GATEWAY_TIMEOUT_MS = 8_000;
export const GATEWAY_BREAKER_FAILURE_THRESHOLD = 5;
export const GATEWAY_BREAKER_OPEN_MS = 30_000;
export const GATEWAY_GET_RETRY = { retries: 2, baseDelayMs: 200, maxDelayMs: 1_000 } satisfies Omit<RetryOptions, 'shouldRetry'>;

// transactions/infrastructure/http/transactions-http.constants.ts
export const TRANSACTIONS_CACHE_CONTROL = 'no-store';
export const GATEWAY_UNAVAILABLE_RETRY_AFTER_SECONDS = 30;   // = GATEWAY_BREAKER_OPEN_MS / 1000
```

`RESERVATION_TTL_MS`, `CURRENCY`, `MAX_QUANTITY`, `INSTALLMENTS_MIN/MAX`, the length limits, `PHONE_PATTERN`, `MUNICIPALITY_CODE_PATTERN`, `IDEMPOTENCY_KEY_HEADER` and `IDEMPOTENT_REPLAYED_HEADER` come from `@checkout/shared`.

### Domain (pure functions)

```ts
// transaction-reference.ts
export function generateReference(now: Date, random: () => number): string;
//   'TX-' + YYYYMMDD at UTC−5 + '-' + 6 chars from REFERENCE_ALPHABET
//   2026-09-28T01:00Z → 'TX-20260927-…'   (8 pm Bogotá, still the 27th)

// request-hash.ts
export function requestHash(body: unknown): string;
//   SHA-256 hex (64 chars) of JSON with keys sorted recursively; arrays keep their order
//   { b: 1, a: { d: 2, c: 3 } } and { a: { c: 3, d: 2 }, b: 1 } → same hash

// integrity-signature.ts
export function integritySignature(input: { reference: string; amountInCents: number; currency: string; secret: string }): string;
//   SHA-256 hex of reference + amountInCents + currency + secret (plain concatenation)

// transaction.errors.ts
export function missingIdempotencyKey(): DomainError;              // MISSING_IDEMPOTENCY_KEY, VALIDATION
export function idempotencyKeyReused(): DomainError;               // IDEMPOTENCY_KEY_REUSED, UNPROCESSABLE
export function priceChanged(expected: Cents, actual: Cents): DomainError;   // PRICE_CHANGED, CONFLICT
export function outOfStockOnReserve(): DomainError;                // OUT_OF_STOCK, CONFLICT
export function customerNotFoundForPayment(): DomainError;         // CUSTOMER_NOT_FOUND, UNPROCESSABLE
export function paymentGatewayUnavailable(): DomainError;          // PAYMENT_GATEWAY_UNAVAILABLE, UNAVAILABLE
```

### Use cases

```ts
interface CreateTransactionCommand {
  idempotencyKey: string;
  requestHash: string;                 // computed in the controller from the validated DTO
  customerId: string; productId: string; quantity: number; installments: number;
  expectedTotalInCents: Cents;
  payment: PaymentInput;               // @checkout/shared/contracts
  delivery: DeliveryInput;
}

interface CreateTransactionOutcome { readonly view: TransactionCreated; readonly replayed: boolean }

CreateTransactionUseCase.execute(cmd): ResultAsync<CreateTransactionOutcome, DomainError>
//   execute() = checkIdempotency → guard → quoteAndVerify → reserve → charge
//   each phase is a private method holding its own decisions (C3 exception)

FinalizeTransactionUseCase.execute(outcome: { id: string; status: FinalStatus; statusMessage: string | null })
  : ResultAsync<'FINALIZED' | 'ALREADY_FINAL', never>
//   one UnitOfWork: transactions.finalize → stock.release → deliveries.transition(CANCELLED)
//   status APPROVED → throws Error('APPROVED finalization lands in api 04.2')   (unreachable from 04.1)

// helpers (mechanical)
toTransactionCreated(tx: Transaction, delivery: Delivery): TransactionCreated
```

### Adapters

```ts
@Injectable()
export class HttpPaymentGatewayAdapter implements PaymentGatewayPort {
  // one CircuitBreaker instance per process (singleton provider)
  ensureAvailable()          // breaker.canRequest() ? ok : err({ kind: 'UNAVAILABLE' })
  createCharge(req)          // POST /transactions · timeout · breaker · NO retry
  getCharge(id)              // GET /transactions/{id} · timeout · breaker · retry
  findChargeByReference(ref) // GET /transactions?reference= · array → first | null
}
```

| Gateway outcome | `PaymentGatewayError.kind` | Counts for the breaker | Use case does |
|---|---|---|---|
| 2xx | — (`Ok(GatewayCharge)`) | success | store `provider_transaction_id`, stay PENDING |
| 4xx | `REJECTED` (message from `error.type` + nested field messages) | no | finalize `ERROR`, 201 |
| 5xx / network error | `UNAVAILABLE` | yes | stay PENDING, 201 |
| 8 s timeout | `TIMEOUT` | yes | stay PENDING, 201 |

Status mapping (anti-corruption): `APPROVED`, `DECLINED`, `VOIDED`, `ERROR` and `PENDING` map one-to-one. Any unknown provider status maps to `PENDING`, so it is never finalized on a guess.

Repositories:

- `TypeOrmTransactionRepository.insert`: TypeORM `insert`. A pg `23505` is mapped by constraint name through `to-transaction-unique-violation.ts`. Any other error rejects (500).
- `finalize`: the raw SQL from `01-data-model.md` §4, returning `{ productId, quantity } | null`.
- `TypeOrmStockReservationRepository`: `reserve` / `release` / `commit`, each the §4 statement verbatim, typed rows, no `as`.
- `TypeOrmDeliveryRepository.transition`: raw SQL conditional `UPDATE … WHERE status = 'AWAITING_PAYMENT'`, per C11.
- Raw SQL runs only through `tx.manager.query($1…)` after narrowing with `instanceof TypeOrmTxContext`.

### HTTP

| Case | Status | Headers |
|---|---|---|
| created | 201 | `Location`, `Cache-Control: no-store` |
| replay | 201 | + `Idempotent-Replayed: true` |
| gateway unavailable | 503 Problem Details | `Retry-After: 30` (set via `@Res({ passthrough: true })` before throwing) |

- `IdempotencyKeyPipe` on `@Headers(IDEMPOTENCY_KEY_HEADER)`: a missing or non-uuid-v4 value throws `DomainErrorException(missingIdempotencyKey())`.
- `CreateTransactionDto` → command mapping happens in the controller. The domain never sees the DTO.

## Implementation plan

Prerequisites (not commits):

- SPEC 06 is merged into `main` (`GetQuoteUseCase` exported from `pricing/index.ts`, `CUSTOMER_REPOSITORY` exported by `CustomersModule`).
- `docker compose up -d postgres && pnpm --filter @checkout/api migration:run` before step 3.
- `.env` has the sandbox `PAYMENT_GATEWAY_*` values (only step 14's manual test uses them).
- infra 05 may run in parallel. This spec adds no dependency to `apps/api/package.json`.

Each step is one commit after review. Target: ≤ ~300 changed lines per step. Pushing and opening PRs happen only when the user asks for them.

### Contract change

1. [x] **Transaction port reports unique violations.** On a branch `chore/transactions-port-insert-violation` cut from `main`, add `TransactionUniqueViolation` and change `insert`'s error type. Nothing else changes: no implementation or fake of this port exists yet. After the user merges that PR, `/spec-impl` creates `spec-08-api-create-transaction` from the updated `main`. This box is ticked in step 2's commit.
   Manual test: `pnpm typecheck` green; the PR diff shows one file.
   Commit: `feat(api): let TransactionRepository.insert report unique violations`.

### Domain

2. [x] **Transactions domain.** `transactions.constants.ts`, `transaction-reference.ts`, `request-hash.ts`, `integrity-signature.ts` and `transaction.errors.ts`, with unit specs. The specs cover:
   - `2026-09-28T01:00Z` → `TX-20260927-…` and `2026-09-27T05:00Z` → `TX-20260927-…`;
   - the random part is 6 characters from the alphabet (injected `random`);
   - key order does not change the hash, array order does, and nested objects are sorted;
   - the signature for a fixed input matches a precomputed SHA-256;
   - each error factory's code and kind.

   Manual test: `pnpm --filter @checkout/api test` green.
   Commit: `feat(api): add transaction reference, request hash and integrity signature`.

### Persistence

3. [x] **Stock reservation adapter.** `TypeOrmStockReservationRepository` in `catalog/infrastructure/persistence/`, wired and exported as `STOCK_RESERVATION` from `catalog.module.ts`. `reserve` / `release` / `commit` run the §4 statements verbatim. The rollback int-spec proves:
   - `reserve` moves `available − q`, `reserved + q` and returns `RESERVED`;
   - `reserve` beyond stock returns `INSUFFICIENT_STOCK` and changes nothing;
   - `reserve` on a soft-deleted product returns `INSUFFICIENT_STOCK`;
   - `release` restores both columns, and `commit` only lowers `reserved`.

   Manual test: `pnpm --filter @checkout/api test:int` green.
   Commit: `feat(api): implement stock reservation with raw SQL`.

4. [ ] **Reservation concurrency proof.** `typeorm-stock-reservation.concurrency.int-spec.ts` creates a product with stock 1 and a random SKU. It then fires 20 `reserve` calls in parallel, each in its own `TypeOrmUnitOfWork`, and proves:
   - exactly 1 `RESERVED` and 19 `INSUFFICIENT_STOCK`;
   - final `stock_available = 0`, `stock_reserved = 1`.

   The product is soft-deleted in a `finally`.
   Manual test: `test:int` three times in a row, all green, and `GET /api/v1/products` shows no test product.
   Commit: `test(api): prove concurrent reservations never oversell`.

5. [ ] **Delivery repository.** `delivery.mapper.ts` and `TypeOrmDeliveryRepository` (all 4 methods), wired and exported as `DELIVERY_REPOSITORY` from `deliveries.module.ts`. `transition` is raw SQL `… WHERE status = 'AWAITING_PAYMENT'`. The rollback int-spec proves:
   - insert, then `findById` / `findByTransactionId`, with and without `tx`;
   - `transition` to `CANCELLED` changes one row;
   - a second `transition` is a no-op.

   Manual test: `test:int` green.
   Commit: `feat(api): implement delivery repository`.

6. [ ] **Transaction repository.** `transaction.mapper.ts`, `helpers/to-transaction-unique-violation.ts` and `TypeOrmTransactionRepository`. The 4 api 06 methods throw `Error('Not implemented — api 06')`. The rollback int-spec proves:
   - insert + `findById` / `findByIdempotencyKey`;
   - a duplicate key → `Err({ constraint: 'IDEMPOTENCY_KEY' })`;
   - a duplicate reference → `Err({ constraint: 'REFERENCE' })`;
   - `recordGatewayResponse` stores the id and message;
   - `finalize` on PENDING returns the stock line, and a second `finalize` returns `null`;
   - each stub throws.

   Manual test: `test:int` green.
   Commit: `feat(api): implement transaction repository with conditional finalize`.

### Gateway

7. [ ] **Gateway mapping.** `gateway-response.mapper.ts`, `gateway-error.classifier.ts` and the `__fixtures__/*.json` files, shaped after `gateway-findings.md` with fake ids. The unit specs cover:
   - each provider status → `TransactionStatus`, and an unknown one → `PENDING`;
   - brand and last 4 read from `payment_method.extra`;
   - extra fields (`merchant`, `entries`, …) ignored;
   - `three_ds_auth` empty and populated;
   - 4xx → `REJECTED` with the nested token message, 5xx → `UNAVAILABLE`;
   - the by-reference array with 0 and 1 match.

   Manual test: `test` green.
   Commit: `feat(api): map payment gateway responses and errors`.

8. [ ] **Gateway HTTP adapter.** `HttpPaymentGatewayAdapter` and `payment-gateway.constants.ts`, over global `fetch` with `withTimeout`, `retryWithBackoff` (GETs only) and one `CircuitBreaker`. The unit specs with mocked `fetch` and fake timers cover:
   - `createCharge` sends the signature, private key, both acceptance tokens, email, installments and token, and is never retried;
   - GETs retry on 5xx and not on 4xx;
   - an 8 s hang → `TIMEOUT`;
   - 5 failures open the breaker, `ensureAvailable` returns `UNAVAILABLE`, and it half-opens after 30 s;
   - 4xx responses do not count toward the breaker;
   - a captured-logger assertion that no line contains the token, keys or signature.

   Manual test: `test` green.
   Commit: `feat(api): add HTTP payment gateway adapter with timeout, retry and breaker`.

### Use cases

9. [ ] **Minimal finalizer.** `FinalizeTransactionUseCase` (release branch), with unit specs over fake ports and a fake `UnitOfWork`. The specs cover:
   - `ERROR` → `finalize`, `release` and `transition(CANCELLED)` in one unit of work, returning `FINALIZED`;
   - an already-final transaction → `ALREADY_FINAL`, with no release and no transition;
   - `APPROVED` throws.

   It is exported from `transactions/index.ts`.
   Manual test: `test` green.
   Commit: `feat(api): add release-only finalize transaction use case`.

10. [ ] **Create transaction: idempotency, guard, quote.** `CreateTransactionUseCase` with `checkIdempotency`, `guard` and `quoteAndVerify`, and `reserve` / `charge` stubbed to `Ok`. The unit specs cover:
    - a replay with the same hash → `replayed: true` and the current state;
    - a different hash → `IDEMPOTENCY_KEY_REUSED`;
    - an open breaker → `PAYMENT_GATEWAY_UNAVAILABLE`, with nothing read or written;
    - an unknown customer → `CUSTOMER_NOT_FOUND`;
    - quote errors pass through;
    - a total mismatch → `PRICE_CHANGED`.

    Manual test: `test` green.
    Commit: `feat(api): add idempotency, guard and quote phases to create transaction`.

11. [ ] **Create transaction: reserve and charge.** Real `reserve` and `charge` phases plus `helpers/to-transaction-created.ts`. The unit specs cover:
    - `INSUFFICIENT_STOCK` → `OUT_OF_STOCK`, with nothing inserted;
    - the snapshots, `reservation_expires_at = now + TTL`, and the delivery with warehouse, distance and rule;
    - a reference collision retried up to 3 times, then a rejection;
    - a key collision → re-read and replay;
    - the gateway `Ok` → `recordGatewayResponse` and PENDING;
    - `REJECTED` → finalize `ERROR` with the message;
    - `TIMEOUT` / `UNAVAILABLE` → PENDING with no provider id;
    - the gateway is never called inside `UnitOfWork.run`.

    Manual test: `test` green.
    Commit: `feat(api): add reserve and charge phases to create transaction`.

### HTTP and wiring

12. [ ] **POST /transactions.** DTOs, `IdempotencyKeyPipe`, `transactions-http.constants.ts`, `transactions.controller.ts`, and the `TransactionsModule` wiring (imports, providers, `UNIT_OF_WORK` / `CLOCK` bindings, plus `SystemClock` if SPEC 06 did not add one). `transactions.controller.spec.ts` (`configureApp` + supertest + fakes) checks:
    - 201 with `Location`, `no-store` and the `TransactionCreated` envelope;
    - 5 identical requests → 1 transaction, 1 gateway call, and `Idempotent-Replayed: true` on requests 2–5;
    - a missing or non-uuid key → 400 `MISSING_IDEMPOTENCY_KEY`;
    - an unknown field, `quantity: 11` and `installments: 0` → 400 with `errors[]`;
    - 409 / 422 codes;
    - 503 with `Retry-After: 30`;
    - the rejection → 201 `ERROR` with `statusMessage`.

    `.logging.spec.ts` proves that no log line contains the token, acceptance tokens, email or phone.
    Manual test: `/api/docs` shows `POST /transactions` with the header and body schema.
    Commit: `feat(api): expose POST /transactions`.

13. [ ] **End-to-end concurrency proof.** `create-transaction.concurrency.int-spec.ts` runs the real use case, the repositories and `TypeOrmUnitOfWork` against Postgres, with a fake gateway. It proves:
    - 20 parallel requests with different keys for a 1-unit product → 1 PENDING and 19 `OUT_OF_STOCK`, and stock `0 / 1`;
    - 2 parallel requests with the **same** key → 1 transaction row, 1 gateway call, and the same id in both responses;
    - a rejected charge → `ERROR`, stock back to `1 / 0`, delivery `CANCELLED`.

    Test products are soft-deleted in a `finally`.
    Manual test: `test:int` three times in a row, all green.
    Commit: `test(api): prove create transaction never oversells or double charges`.

### Close-out

14. [ ] **Sandbox check, coverage and CI.**
    - Against the local API with sandbox keys: tokenize card 4242 and fetch fresh acceptance tokens with curl, then `POST /transactions`. Expect 201 PENDING with a stored `provider_transaction_id`.
    - Repeat with a made-up token. Expect 201 `ERROR` and restored stock.
    - Run `test:cov` and check `modules/transactions` ≥ 85 % on all four metrics.
    - When the user asks, push and open the PR with `gh-cli`, wait for CI, and fix whatever fails.
    - Finally, mark this spec `Implemented`.

    Manual test: every check green.
    Commit: `docs: mark spec 08 as Implemented`.

Notes:

- A CI fix in step 14 goes in its own `fix: …` commit, after review.
- If another frozen port or a `packages/shared` contract turns out to be wrong, stop and apply the contract-change protocol.
- Checkpoint C3 (full flow with 4242 / 4111) runs after api 04.2 and web 04. It is not part of this spec.

## Acceptance criteria

Endpoint and contract

- [ ] `POST /api/v1/transactions` with a valid body and key returns 201, `Location: /api/v1/transactions/{id}`, `Cache-Control: no-store`, and `{ data }` with exactly the `TransactionCreated` fields.
- [ ] A new transaction's `reference` matches `^TX-\d{8}-[A-Z0-9]{6}$`, and its date is the purchase day in `America/Bogota`.
- [ ] A missing `Idempotency-Key`, or one that is not uuid v4, returns 400 `MISSING_IDEMPOTENCY_KEY`.
- [ ] An unknown body field, `quantity: 0`, `quantity: 11`, `installments: 0`, `installments: 37` and a phone not matching `PHONE_PATTERN` each return 400 `VALIDATION_ERROR` with `errors[]` naming the dotted field.
- [ ] An unknown `customerId` returns 422 `CUSTOMER_NOT_FOUND`. Unknown product or municipality returns 422 with its code.
- [ ] An `expectedTotalInCents` differing from the server quote returns 409 `PRICE_CHANGED`, and no transaction, delivery or stock change exists afterwards.
- [ ] With the breaker open, the response is 503 `PAYMENT_GATEWAY_UNAVAILABLE` with `Retry-After: 30`, and no row is created.

Idempotency

- [ ] Sending the same request 5 times creates 1 transaction and makes 1 gateway call. Responses 2–5 are 201 with the same `id` and `Idempotent-Replayed: true`.
- [ ] Same key with a different body returns 422 `IDEMPOTENCY_KEY_REUSED`.
- [ ] Two concurrent requests with the same key end with 1 transaction row and 1 gateway call (int-spec).

Stock

- [ ] 20 parallel requests for a 1-unit product end with exactly 1 PENDING and 19 `OUT_OF_STOCK`, and `stock_available = 0`, `stock_reserved = 1` (int-spec, green three runs in a row).
- [ ] A PENDING transaction moves the product's stock by `available − q`, `reserved + q`, and its delivery is `AWAITING_PAYMENT` with warehouse, distance and fee rule filled.
- [ ] `reservation_expires_at` equals `created_at + 5 min` (± 1 s).

Gateway outcomes

- [ ] A gateway 2xx stores `provider_transaction_id` and the response is `PENDING`.
- [ ] A gateway 4xx returns 201 with `status: "ERROR"` and a non-null `statusMessage`. Stock returns to its prior values, and the delivery is `CANCELLED`.
- [ ] A gateway timeout or 5xx returns 201 `PENDING` with no `provider_transaction_id`. The stock stays reserved.
- [ ] The gateway is never called inside an open `UnitOfWork` (unit-spec assertion).
- [ ] 4xx responses do not open the breaker, and 5 consecutive 5xx / timeouts do.

Security and logging

- [ ] No log line produced by the controller, the use case or the adapter contains the card token, either acceptance token, the private key, the integrity secret, the signature, the email or the phone (logging spec).
- [ ] No transaction or delivery row is ever deleted or soft-deleted by this spec's code.

Architecture

- [ ] Raw SQL exists only in the stock reserve / release / commit, transaction `finalize` and delivery `transition` statements, all under `infrastructure/persistence`, each with an int-spec.
- [ ] `TransactionRepository.insert` returns `Err(TransactionUniqueViolation)` and the port change landed in its own PR.
- [ ] The 4 api 06 repository methods throw `Not implemented — api 06`, and a test proves it.
- [ ] `apps/api/package.json` and `pnpm-lock.yaml` are unchanged.

Quality and CI

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @checkout/api test:cov` and `test:int` exit 0 locally.
- [ ] The coverage report shows `modules/transactions` ≥ 85 % on statements, branches, functions and lines, and `apps/api` stays ≥ 80 % globally.
- [ ] Sandbox manual check: card 4242 returns 201 PENDING with a stored provider id, and a made-up token returns 201 `ERROR` with the stock restored.
- [ ] The PR shows green `lint`, `typecheck`, `coverage (api)` and `api-integration`.

## Decisions

Spec and branch

- **Yes:** SPEC 08 with branch `spec-08-api-create-transaction`, created by `/spec-impl`. SPEC 06 (api-checkout) and 07 (web-checkout) already hold those numbers.
- **No:** `feat/04.1-api-create-transaction` from the phase file. Earlier specs settled on `spec-NN-slug`.

Scope split with api 04.2

- **Yes:** a release-only `FinalizeTransactionUseCase` lands here. The phase requires a definitive rejection to end as `ERROR` with stock released and the delivery cancelled. api 04.2 extends the same use case with the APPROVED branch, gateway sync and event publishing.
- **No:** leaving a rejected transaction PENDING until 04.2. It breaks the contract between the two PRs and holds stock for 5 minutes on every bad token.
- **No:** inlining the finalization in `CreateTransactionUseCase`. 04.2 would replace it, so the logic would exist twice.
- **Yes:** a gateway 201 always leaves the transaction PENDING, even when it already reports a final status. The spike never saw one. Handling it here would pull the APPROVED branch forward from 04.2.
- **Yes:** `TypeOrmDeliveryRepository` is created here with all 4 methods, although 04.2 owns `deliveries/**`. The phase assigns the delivery insert to 04.1, and the finalizer needs `transition`. `findById` is one line.
- **Yes:** stock `commit` is implemented now next to `reserve` / `release`. It is one §4 statement, and it leaves the adapter complete.
- **Yes:** the 4 api 06 methods of `TransactionRepository` throw `Not implemented — api 06`. `FOR UPDATE SKIP LOCKED` selection and email retry belong to the reconciler's design.
- **No:** implementing them now. They inflate the highest-risk phase and pre-empt api 06's decisions.

Contract change

- **Yes:** `insert` returns `Err(TransactionUniqueViolation)` through a separate PR, following the contract-change protocol and the precedent of SPEC 06's customer port. A concurrent duplicate key and a reference collision are expected outcomes, not 500s.
- **No:** checking `findByIdempotencyKey` before insert as the only guard. Two requests can both see "no row" and race. The unique index is the guarantee.

Idempotency

- **Yes:** `request_hash` covers the whole validated body, payment tokens included, with keys sorted recursively. An automatic retry resends the same bytes, so it matches. A new "Pagar" click uses a new key, so it never collides. Only the irreversible hash is stored.
- **No:** hashing only the business fields. A retry with a different card would silently replay the old transaction.
- **Yes:** a replay returns the transaction's **current** state (it may already be `ERROR`), with no gateway call.
- **Yes:** on a key collision inside the unit of work, roll back, re-read by key, and replay (or return 422 on a different hash).
- **Yes, recorded for the web spec:** a new key per "Pagar" click, and the same key and body on automatic network retries. The gateway's acceptance tokens are single-use, so a new attempt needs fresh tokens anyway.

Gateway outcome classification

- **Yes:** any 4xx is definitive (`REJECTED` → `ERROR`), because the gateway refused the request before creating a charge. Any 5xx, network error or timeout is uncertain and stays PENDING, and the reconciler resolves it by reference.
- **No:** only 422 as definitive. A misconfigured key (401) would hold stock for 5 minutes on every attempt.
- **Yes:** an unknown provider status maps to `PENDING`. A transaction is never finalized on a guess.
- **Yes:** no deletion of transactions or deliveries on failure. They are financial records (`references/data-integrity.md`). `ERROR` + `CANCELLED` + released stock gives the user the same outcome and keeps the audit trail. In the uncertain case, a deleted row would leave no place to record a late APPROVED.

Circuit breaker

- **Yes:** 5 consecutive failures open it for 30 s, and only 5xx, network errors and timeouts count. Invalid tokens from customers must not stop sales for everyone else.
- **Yes:** `Retry-After: 30` as a fixed constant equal to the open duration.
- **No:** computing the remaining open time. `CircuitBreaker` does not expose it, and `shared/` is not this phase's to change.
- **Yes:** `Retry-After` is set by the controller through `@Res({ passthrough: true })` before throwing. The `ProblemDetailsFilter` stays untouched.
- **Yes:** the guard runs before the quote and the reservation, so an open breaker creates nothing.

Reference

- **Yes:** the date in `America/Bogota` computed as fixed UTC−5. It matches the day the customer bought, and Colombia has no DST, so no timezone library is needed.
- **No:** UTC. An 8 pm purchase would carry the next day's date.
- **Yes:** a reference collision retries the whole unit of work up to 3 times. A unique violation aborts the Postgres transaction, so the insert cannot simply be repeated inside it.

Charge

- **Yes:** the gateway is called only after the reservation commits, which the lint rule on `infrastructure/persistence` and a unit assertion enforce. No row locks are held during a network call.
- **Yes:** the card brand and last 4 stored are the ones the client sent from tokenization. The gateway's copy is not needed to create the row.
- **Yes:** `createCharge` is never retried. A retry could double charge. The reference lookup is the recovery path.

Testing

- **Yes:** hand-written gateway fixtures shaped after `gateway-findings.md`, with fake ids.
- **No:** recording and scrubbing real sandbox responses. A failed scrub would commit real ids or keys.
- **Yes:** concurrency int-specs commit real rows and soft-delete their test products in a `finally`. Real commits are needed to race, and soft-delete hides the products from the public catalog while keeping `testing.md`'s "no hard delete" rule.
- **No:** leaving test products visible. Every `test:int` run would add junk to the local catalog and to checkpoints C1 / C3.
- **Yes:** two concurrency layers. One is at the SQL (20 `reserve` calls). The other is end to end through the use case (20 requests, and the same-key race).

Wiring

- **Yes:** `UNIT_OF_WORK` and `CLOCK` are bound in `TransactionsModule`, with a new `SystemClock`, unless SPEC 06 already bound them. Nothing in `main` binds them today.
- **Yes:** `catalog` imports `STOCK_RESERVATION` and `StockReservationPort` from `transactions/index.ts`. The port is declared by its consumer (`03-folder-structure.md`), and `transactions/index.ts` exports no module, so there is no import cycle.

Workflow

- **Yes:** push and PR only when the user asks, in both step 1 and step 14.

## Risks

| Risk | Mitigation |
| --- | --- |
| SPEC 06 merges with different names or shapes than assumed (`GetQuoteUseCase.execute`, `Quote` fields, `CUSTOMER_REPOSITORY` export, a shared `UNIT_OF_WORK` / `CLOCK` binding). | Step 10 starts by reading `pricing/index.ts` and `customers.module.ts` on `main`. Adapt names, not shape. If SPEC 06 already binds `UNIT_OF_WORK` / `CLOCK`, reuse it and skip `SystemClock`. |
| The concurrency int-specs pass without really racing, because the pool serialises the connections or `Promise.all` runs them one by one. | 20 attempts, each in its own `UnitOfWork`, with the pool size checked to be ≥ 20 in the test setup. The manual test runs `test:int` three times. The assertion is on final stock numbers, not only on outcomes. |
| A same-key race where the second request reads the row while the first is still charging returns PENDING without a provider id. | Accepted: the replay returns the current state, which is correct. The frontend polls `GET /transactions/:id` (api 04.2) either way. |
| The gateway creates the charge but the response is lost (timeout after the gateway processed it). The row stays PENDING with no `provider_transaction_id`. | By design: the reference is sent to the gateway, and the api 06 reconciler finds the charge with `GET /transactions?reference=`. `createCharge` is never retried. |
| A gateway 4xx that actually created a charge (undocumented behaviour) would be finalized as `ERROR` while money moved. | The spike confirmed that 422 creates nothing. The classifier is table-tested per status, and the reconciler (api 06) can still find a stray charge by reference. Checkpoint C3 re-verifies against the sandbox. |
| A breaker opening between the guard and the charge leaves a reserved PENDING transaction with no charge. | Handled as `UNAVAILABLE`: it stays PENDING, and the reservation TTL (api 06 expiry) releases the stock after 5 minutes. |
| Secrets leak through an error object logged by Nest (for example a `fetch` error that carries the request init with headers). | The adapter never passes request objects into errors. It builds `PaymentGatewayError` with a message only. The logging spec asserts on captured output for every gateway branch. |
| pg unique-violation constraint names differ from the assumed `transactions_idempotency_key_key` / `transactions_reference_key`. | The repository int-spec triggers both violations against the real migrated schema. If the names differ, fix the mapping, never the migration. |
| infra 05 edits `apps/api/package.json` in parallel and the lockfile conflicts. | This spec adds no dependencies. If a rebase still conflicts, apply the lockfile protocol. |
| Coverage of `modules/transactions` falls below 85 % because of the adapter's defensive branches. | Fixtures cover every mapping branch (step 7). Coverage is checked per module in step 14 before the PR. |

## What is **not** in this spec

- `GET /transactions/:id`, gateway status sync, the APPROVED finalization branch, the `transaction.finalized` event and the in-memory `EventPublisher` (api 04.2).
- `GET /deliveries/:id` as an endpoint (api 04.2).
- Webhook, reconciler, reservation expiry, SQS, email, and the 4 stubbed repository methods (api 06).
- Rate limiting of `POST /transactions` (api 07).
- The frontend's idempotency-key policy (web spec).
- Any deletion of transactions or deliveries.
- New dependencies, and changes to `packages/shared`, other frozen ports, ORM entities, migrations, `GetQuoteUseCase`, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.

Each of these, if it lands, goes in its own spec.
