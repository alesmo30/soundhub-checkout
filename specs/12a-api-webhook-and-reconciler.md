# SPEC 12a — API: payment webhook and reconciler

> **Status:** Implemented
> **Depends on:** SPEC 10 (blocking: complete `FinalizeTransactionUseCase` with event publishing), SPEC 08 (blocking: transaction repository, `findChargeByReference` / `getCharge` adapter), SPEC 09 (blocking only for the reconciler Lambda handler step: `load-secrets.ts`, `build:lambda`). SPEC 12b (email notifications) follows this one.
> **Date:** 2026-09-27
> **Objective:** No transaction stays PENDING forever and reserved stock always comes back — a checksum-verified webhook and a leased, time-boxed reconciler (sync, safe expiry by reference, email re-publish) converge on the same idempotent finalization, and two reconciler runs never process the same row.

> Source phase: `phases/sunday/api/06-async.md` (Part 1). Part 2 (email notifications) is SPEC 12b.
> The `12a` / `12b` suffix marks two specs from the same phase: 12a goes first, 12b depends on it.

## Scope

**In:**

Contract change (separate PR, step 1)

- `TransactionRepository.findByProviderTransactionId(providerTransactionId)` → `Transaction | null`.
- Comment-only updates on `claimPendingForSync`, `claimExpiredReservations` and `findUnsentEmails` to document their lease semantics. Their signatures do not change.

Repository (the 4 methods SPEC 08 stubbed, plus the new one)

- `findByProviderTransactionId`: a TypeORM lookup on the existing unique `provider_transaction_id`.
- `markEmailSent`: a conditional update (`WHERE email_sent_at IS NULL`) through the QueryBuilder.
- Three **leased claims** in raw SQL (C11, reconciler selection). Each one is a single `UPDATE transactions SET updated_at = now() WHERE id IN (SELECT id … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`, committed right away. The bumped `updated_at` is the lease.
  - `claimPendingForSync(tx, { olderThan, limit })`: PENDING, with a provider id, `updated_at < olderThan`.
  - `claimExpiredReservations(tx, { now, limit })`: PENDING, **without** a provider id, `reservation_expires_at < now`, `updated_at < now − RECONCILER_LEASE_MS`.
  - `findUnsentEmails({ finalizedBefore, limit })`: any final status (EXPIRED included), `email_sent_at IS NULL`, `finalized_at < finalizedBefore`, `updated_at < now − EMAIL_REPUBLISH_LEASE_MS`. It runs as its own autocommit statement.

Webhook

- `POST /api/v1/webhooks/payments` → always `200 { data: { received: true } }` once the checksum is valid.
- `event-checksum.ts`: concatenate the values named in `signature.properties` (read from `data`, in that order), then `timestamp`, then the events secret. Hash with SHA-256 (hex). Compare against the `X-Event-Checksum` header with `crypto.timingSafeEqual`. A missing header, a malformed body or a mismatch → 401 `INVALID_SIGNATURE`.
- `HandlePaymentWebhookUseCase` receives the parsed, verified event:
  - an event type other than `transaction.updated` → `IGNORED`;
  - `findByProviderTransactionId` returns null → `UNKNOWN_TRANSACTION` (logged; the reconciler resolves it by reference);
  - the status is trusted as signed and mapped with SPEC 08's anti-corruption mapping. PENDING or unknown → `IGNORED`;
  - a final status → `FinalizeTransactionUseCase` → `FINALIZED` or `ALREADY_FINAL`.
- The body is read as `unknown` and parsed by hand, so the global `ValidationPipe` never rejects the gateway's extra fields.
- Logs carry only the event type, the provider id and the outcome. They never carry the body, the checksum or the secret.

Reconciler

- `ReconcileTransactionsUseCase.execute()` runs three tasks in order: **(a) → (b) → (c)**. Tasks (a) and (b) share one **30 s time budget**. Before each gateway call, the use case checks the budget and stops if it is spent. The rows it did not reach keep their lease and are taken by a later run.
  - **(a) Sync.** It claims up to 20 transactions (`olderThan = now − 1 min`) and calls `getCharge` for each.
    - a final status → finalize;
    - PENDING → nothing;
    - `Err` → counted as `failed`, retried after the lease.
  - **(b) Expire safely.** It claims up to 20 expired reservations and calls `findChargeByReference` for each.
    - `null` → finalize `EXPIRED`;
    - found → `recordGatewayResponse` (stores the provider id), then finalize when final, or leave it PENDING for task (a);
    - `Err` → untouched and counted as `failed`.
  - **(c) Re-publish.** It takes up to 20 unsent-email transactions (`finalizedBefore = now − 5 min`, lease 5 min) and publishes `transaction.finalized` for each. A publish `Err` is logged at `warn`.
- It returns and logs `{ synced, expired, recovered, republished, deferred, failed }`.
- It never finalizes a transaction the gateway reports as PENDING, and never expires one whose charge exists.
- `workers/reconciler.handler.ts` (Lambda):
  1. `loadSecretsIntoEnv()` (SPEC 09);
  2. `NestFactory.createApplicationContext(AppModule)`, cached per container;
  3. run the use case, log the summary and return it.
- `reconcile-once.cli.ts` + the `reconcile:once` script run the use case once against the local `.env`. This is the manual test path.

Tests

- Unit: the checksum, the webhook event parser, every webhook outcome, every reconciler branch, and the budget cut-off with a fake clock.
- Integration: the new repository methods and each claim's lease behavior; an abandoned reservation → `EXPIRED` with stock released; a lost-response charge → `APPROVED`; **two concurrent reconciler runs claim disjoint rows** (green 10 runs in a row).
- Controller spec for the webhook (401 / 200 / extra fields) and a logging spec.

**Out of scope (for future specs):**

- `SqsEventPublisher`, the email worker, `SendTransactionEmailUseCase`, the templates (the EXPIRED one included) and the SMTP adapters (SPEC 12b).
- The AWS resources: the reconciler Lambda, the EventBridge Scheduler `rate(1 minute)`, log groups, alarms and the SQS queue (infra 06).
- Registering the webhook in the gateway dashboard. FR-25: the test account is shared.
- Excluding the webhook from the per-IP throttler (api 07, where the throttler is configured).
- Looking up transactions by reference from the webhook.
- Re-fetching the charge from the gateway inside the webhook.
- Changing SPEC 08's gateway constants, or SPEC 10's finalizer.
- A new migration or index. The existing unique `provider_transaction_id`, `idx_tx_pending` and `idx_tx_email_retry` back every query.
- Any change to `packages/shared`, other frozen ports, ORM entities, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.

## Data model

No tables, columns, migrations or indexes are added. The lease reuses the existing `transactions.updated_at` column.

### Files

```
apps/api/
├─ package.json                                    + "reconcile:once" script
├─ jest.config.ts                                  + coverage exclusions: reconciler.handler.ts, reconcile-once.cli.ts
└─ src/
   ├─ workers/
   │  reconciler.handler.ts                        Lambda entry (coverage-excluded bootstrap)
   │  reconcile-once.cli.ts                        local one-shot run (coverage-excluded bootstrap)
   └─ modules/transactions/
      ├─ application/ports/transaction.repository.port.ts   + findByProviderTransactionId · lease comments  (step 1, own PR)
      ├─ domain/
      │  reconciler.constants.ts
      │  event-checksum.ts
      │  transaction.errors.ts                     + invalidSignature
      ├─ application/use-cases/
      │  handle-payment-webhook.use-case.ts
      │  reconcile-transactions.use-case.ts
      ├─ infrastructure/
      │  ├─ persistence/
      │  │  typeorm-transaction.repository.ts      ~ 4 stubs implemented + findByProviderTransactionId
      │  │  reconciler-claims.int-spec.ts
      │  │  reconcile-transactions.int-spec.ts
      │  │  reconcile-transactions.concurrency.int-spec.ts
      │  └─ http/
      │     payment-webhook.controller.ts (+ .spec.ts, + .logging.spec.ts)
      │     payment-webhook.parser.ts              unknown body → PaymentEvent | null
      │     __fixtures__/{transaction-updated-approved, transaction-updated-declined,
      │                   transaction-updated-pending, other-event}.json
      └─ transactions.module.ts                    + controller · both use cases
```

Unit specs sit next to every domain file, use case and parser.

### Contract change (step 1)

```ts
// transactions/application/ports/transaction.repository.port.ts
findByProviderTransactionId(providerTransactionId: string): ResultAsync<Transaction | null, never>;

// Comment-only, signatures unchanged:
// claimPendingForSync       — leased claim: bumps updated_at; olderThan applies to updated_at.
// claimExpiredReservations  — leased claim: bumps updated_at; lease = RECONCILER_LEASE_MS.
// findUnsentEmails          — leased claim: bumps updated_at; lease = EMAIL_REPUBLISH_LEASE_MS.
```

### Constants

```ts
// transactions/domain/reconciler.constants.ts
export const RECONCILER_LEASE_MS = 60_000;              // = the "older than 1 min" of FR-24
export const RECONCILER_TIME_BUDGET_MS = 30_000;        // + one worst-case gateway call (~25 s) < the lease
export const RECONCILER_BATCH_SIZE = 20;                // per task
export const EMAIL_REPUBLISH_AFTER_MS = 300_000;        // finalized more than 5 min ago
export const EMAIL_REPUBLISH_LEASE_MS = 300_000;        // at most one re-publish per transaction every 5 min
export const EXPIRED_STATUS_MESSAGE = 'Reservation expired before reaching the payment gateway';

// transactions/infrastructure/http/ (existing constants file or a new one)
export const EVENT_CHECKSUM_HEADER = 'X-Event-Checksum';
export const PAYMENT_EVENT_TRANSACTION_UPDATED = 'transaction.updated';
```

### Claim SQL (shape, parameterized)

```sql
-- claimPendingForSync
UPDATE transactions SET updated_at = now()
 WHERE id IN (SELECT id FROM transactions
               WHERE status = 'PENDING' AND provider_transaction_id IS NOT NULL
                 AND updated_at < $1                      -- olderThan
               ORDER BY updated_at LIMIT $2
               FOR UPDATE SKIP LOCKED)
RETURNING *;
-- claimExpiredReservations: status = 'PENDING' AND provider_transaction_id IS NULL
--   AND reservation_expires_at < $1 AND updated_at < $1 - lease
-- findUnsentEmails: status <> 'PENDING' AND email_sent_at IS NULL
--   AND finalized_at < $1 AND updated_at < now() - lease
```

Rows are typed by annotating the variable and mapped with `transaction.mapper.ts` (C11, no `as`).

### Domain

```ts
// event-checksum.ts
export function eventChecksum(input: {
  data: unknown; properties: readonly string[]; timestamp: number; secret: string;
}): string;
//   values = properties.map(path => get(data, path))   e.g. 'transaction.status' → data.transaction.status
//   SHA-256 hex of values.join('') + timestamp + secret
export function isValidChecksum(expected: string, received: string): boolean;   // timingSafeEqual, false on length mismatch

// transaction.errors.ts
export function invalidSignature(): DomainError;   // INVALID_SIGNATURE, UNAUTHORIZED
```

### Webhook

```ts
interface PaymentEvent {                          // produced by payment-webhook.parser.ts
  event: string;                                  // 'transaction.updated', …
  providerTransactionId: string;                  // data.transaction.id (signed)
  providerStatus: string;                         // data.transaction.status (signed)
  statusMessage: string | null;
  signature: { properties: string[] };
  timestamp: number;
  data: unknown;                                  // kept only to compute the checksum
}

HandlePaymentWebhookUseCase.execute(event: { type: string; providerTransactionId: string;
                                             status: TransactionStatus; statusMessage: string | null })
  : ResultAsync<'FINALIZED' | 'ALREADY_FINAL' | 'IGNORED' | 'UNKNOWN_TRANSACTION', never>
```

| Case | HTTP | Outcome |
|---|---|---|
| no `X-Event-Checksum`, unparseable body, or checksum mismatch | 401 `INVALID_SIGNATURE` | — |
| valid, `event ≠ transaction.updated` | 200 | `IGNORED` |
| valid, provider id not found | 200 | `UNKNOWN_TRANSACTION` |
| valid, status PENDING or unknown | 200 | `IGNORED` |
| valid, final status | 200 | `FINALIZED` / `ALREADY_FINAL` |

### Reconciler

```ts
interface ReconcileSummary {
  synced: number;       // (a) finalized from getCharge
  expired: number;      // (b) no charge found → EXPIRED
  recovered: number;    // (b) charge found by reference → provider id stored (and finalized if final)
  republished: number;  // (c)
  deferred: number;     // claimed but not reached before the budget ran out
  failed: number;       // gateway Err in (a) or (b)
}

ReconcileTransactionsUseCase.execute(): ResultAsync<ReconcileSummary, never>
//   execute() = syncPending → expireReservations → republishUnsentEmails   (private phases, C3 exception)
//   deadline = clock.now() + RECONCILER_TIME_BUDGET_MS, checked before every gateway call
```

## Implementation plan

Prerequisites (not commits):

- SPEC 08 and SPEC 10 are merged into `main`. `/spec-impl` then creates `spec-12a-api-webhook-and-reconciler` from the updated `main`.
- SPEC 09 is merged before step 11 (the Lambda handler). Steps 1–10 do not need it.
- `docker compose up -d postgres && pnpm --filter @checkout/api migration:run` before step 2.
- `.env` has the sandbox `PAYMENT_GATEWAY_*` values, `PAYMENT_GATEWAY_EVENTS_SECRET` included (manual tests in steps 10 and 12).

Each step is one commit after review. Target: ≤ ~300 changed lines per step. Pushing and opening PRs happen only when the user asks.

### Contract change

1. [x] **Transaction port finds by provider id.** On a branch `chore/transactions-port-find-by-provider-id` cut from `main`: add `findByProviderTransactionId` and the lease comments. Give `TypeOrmTransactionRepository` a `findByProviderTransactionId` that throws `Not implemented — spec 12a` so the build stays green. After the user merges that PR, `/spec-impl` creates the spec branch from the updated `main`. This box is ticked in step 2's commit.
   Manual test: `pnpm typecheck` green; the PR diff shows the port and the one-line stub.
   Commit: `feat(api): let TransactionRepository find by provider transaction id`.

### Repository

2. [x] **Provider-id lookup and conditional email mark.** `findByProviderTransactionId` and `markEmailSent` (`UPDATE … WHERE id = $1 AND email_sent_at IS NULL`). The int-spec proves:
   - a lookup by a stored provider id returns the row, and an unknown id returns `null`;
   - `markEmailSent` sets `email_sent_at` once, and a second call leaves the first timestamp untouched.

   Manual test: `pnpm --filter @checkout/api test:int` green.
   Commit: `feat(api): find transactions by provider id and mark emails sent once`.

3. [x] **Leased claims.** `claimPendingForSync`, `claimExpiredReservations` and `findUnsentEmails` as the raw SQL above. `reconciler-claims.int-spec.ts` seeds rows and backdates `updated_at` with a test-only `UPDATE`. It proves, for each claim:
   - it returns only the rows matching its filter (status, provider id, expiry, finalized age, `email_sent_at`);
   - it bumps `updated_at` on the claimed rows;
   - a second claim right after returns none of them (the lease holds);
   - after backdating `updated_at` past the lease, they are claimable again;
   - `limit` is honored.

   Manual test: `test:int` green.
   Commit: `feat(api): implement leased reconciler claims with SKIP LOCKED`.

### Webhook

4. [x] **Event checksum and parser.** `reconciler.constants.ts`, `event-checksum.ts`, `invalidSignature`, `payment-webhook.parser.ts` and the `__fixtures__/*.json` files (hand-written from the gateway's documented event shape, fake ids, checksums computed with a test secret). The unit specs cover:
   - a fixture's checksum matches its precomputed value;
   - a wrong secret, a tampered `status` and a tampered `timestamp` each fail;
   - a changed field that is **not** in `signature.properties` does not change the checksum (documents why only signed fields are trusted);
   - `isValidChecksum` returns false on a length mismatch without throwing;
   - the parser returns `null` for a missing `data.transaction.id`, a missing `signature`, or a non-object body, and ignores extra fields.

   Manual test: `pnpm --filter @checkout/api test` green.
   Commit: `feat(api): verify payment event checksums`.

5. [x] **Webhook use case.** `HandlePaymentWebhookUseCase` over fake ports. The unit specs cover every row of the webhook table:
   - an event type other than `transaction.updated` → `IGNORED`, with no repository call;
   - an unknown provider id → `UNKNOWN_TRANSACTION`;
   - PENDING or an unmapped status → `IGNORED`, with no finalize;
   - APPROVED / DECLINED / VOIDED / ERROR → finalize with that status and the event's message → `FINALIZED`;
   - a replay → `ALREADY_FINAL`;
   - no gateway call on any path.

   Manual test: `test` green.
   Commit: `feat(api): handle payment webhook events through the finalizer`.

6. [x] **POST /webhooks/payments.** `payment-webhook.controller.ts` (`@Body() body: unknown`, `@Headers(EVENT_CHECKSUM_HEADER)`), with the events secret from `AppConfig`, plus the `TransactionsModule` wiring. `payment-webhook.controller.spec.ts` (`configureApp` + supertest + fakes) checks:
   - a valid fixture → 200 `{ data: { received: true } }`;
   - a missing header, a wrong checksum and a garbage body → 401 `INVALID_SIGNATURE` Problem Details;
   - a body with extra unknown fields is accepted (no 400);
   - another event type → 200.

   `.logging.spec.ts` proves no log line contains the checksum, the secret or the body.
   Manual test: `/api/docs` shows the endpoint. With `pnpm dev`, a fixture sent with curl and a checksum computed via `node -e` returns 200, and the same body with one letter changed returns 401.
   Commit: `feat(api): expose POST /webhooks/payments`.

### Reconciler

7. [x] **Reconciler: sync task and budget.** `ReconcileTransactionsUseCase` with `syncPending` real and the other two phases returning zero. It uses a fake clock and fake ports. The unit specs cover:
   - a final status → finalize, `synced + 1`;
   - PENDING → no finalize;
   - `Err` → `failed + 1`, no finalize;
   - the claim runs in its own unit of work and `getCharge` is never called inside `UnitOfWork.run`;
   - with the clock advanced past 30 s after the 3rd call, calls 4–20 are skipped and `deferred = 17`.

   Manual test: `test` green.
   Commit: `feat(api): add reconciler sync task with a time budget`.

8. [x] **Reconciler: safe expiry and re-publish.** `expireReservations` and `republishUnsentEmails`. The unit specs cover:
   - `findChargeByReference` → `null` → finalize `EXPIRED` with `EXPIRED_STATUS_MESSAGE`, `expired + 1`;
   - found and APPROVED → `recordGatewayResponse`, then finalize APPROVED, `recovered + 1`;
   - found and PENDING → `recordGatewayResponse` only, no finalize;
   - `Err` → nothing written, `failed + 1`;
   - the budget is shared with task (a);
   - (c) publishes one `transaction.finalized` per row with its stored status, EXPIRED included;
   - a publish `Err` → `warn`, and the other rows are still published.

   Manual test: `test` green.
   Commit: `feat(api): expire reservations safely and re-publish unsent emails`.

9. [x] **Reconciler integration and concurrency proof.** Both int-specs run the real use case, repositories, `TypeOrmUnitOfWork` and `FinalizeTransactionUseCase` against Postgres, with a fake gateway and a counting publisher.
   - `reconcile-transactions.int-spec.ts` proves:
     - a PENDING row without a provider id whose reservation expired, where the gateway has no charge → `EXPIRED`, stock `10 / 0`, delivery `CANCELLED`;
     - the same setup, where the gateway has an APPROVED charge by reference → provider id stored, `APPROVED`, stock `8 / 0`;
     - a PENDING row with a provider id older than 1 min, where the gateway says DECLINED → `DECLINED`, stock restored;
     - a row finalized 6 min ago without an email → 1 event, and a second run right after publishes none.
   - `reconcile-transactions.concurrency.int-spec.ts` seeds 10 syncable rows. It runs two `execute()` calls in parallel against a fake gateway that delays 200 ms and records every `getCharge` id. It proves:
     - the two id sets are disjoint;
     - their union is all 10 rows.

   Test products are soft-deleted in a `finally`.
   Manual test: `for i in $(seq 10); do pnpm --filter @checkout/api test:int -- reconcile-transactions.concurrency || break; done`, all green.
   Commit: `test(api): prove the reconciler expires safely and never double-processes`.

10. [x] **Local one-shot run.** `workers/reconcile-once.cli.ts`: `NestFactory.createApplicationContext(AppModule)`, run the use case, print the summary, close. Add the `reconcile:once` script, compiled through `nest start --entryFile workers/reconcile-once.cli` so decorator metadata is emitted (`tsx` would not). Add it to the coverage exclusions.
    Manual test: with `pnpm dev` stopped, create a transaction whose charge times out (or insert one with `reservation_expires_at` in the past and no provider id), then run `pnpm --filter @checkout/api reconcile:once`. Expect `{ expired: 1, … }`, the row `EXPIRED`, stock back, and one "event published" line.
    Commit: `feat(api): add a local one-shot reconciler command`.

11. [x] **Reconciler Lambda handler.** Requires SPEC 09 on `main`. `workers/reconciler.handler.ts`: `loadSecretsIntoEnv()`, then an application context cached in a module-level promise, then the use case, then log and return the summary. Add it to the `build:lambda` entries and to the coverage exclusions.
    Manual test: `build:lambda`, then `node -e "require('./dist-lambda/workers/reconciler.handler.js').handler({}).then(console.log)"` against docker Postgres prints the summary.
    Commit: `feat(api): add the reconciler Lambda handler`.

### Close-out

12. [x] **Coverage and CI.**
    - `test:cov`: `handle-payment-webhook.use-case.ts`, `reconcile-transactions.use-case.ts`, `event-checksum.ts` and `payment-webhook.parser.ts` ≥ 85 % on all four metrics. `apps/api` stays ≥ 80 %.
    - Re-run step 10's manual check against the sandbox, including a lost-response case recovered as `APPROVED`.
    - When the user asks, push and open the PR with `gh-cli`, wait for CI, and fix whatever fails.
    - Finally, mark this spec `Implemented`.

    Manual test: every check green.
    Commit: `docs: mark spec 12a as Implemented`.

Notes:

- A CI fix in step 12 goes in its own `fix: …` commit, after review.
- If another frozen port or a `packages/shared` contract turns out to be wrong, stop and apply the contract-change protocol.

## Acceptance criteria

Webhook

- [ ] A body whose `X-Event-Checksum` matches SHA-256(values of `signature.properties` + `timestamp` + events secret) returns 200 `{ data: { received: true } }`.
- [ ] A missing header, a wrong secret, a tampered signed field, or an unparseable body returns 401 `INVALID_SIGNATURE`.
- [ ] The checksum comparison uses `timingSafeEqual`, and a length mismatch returns 401 without throwing.
- [ ] A valid `transaction.updated` with a final status finalizes the transaction found by provider id, with stock and delivery moved per SPEC 10.
- [ ] Sending the same valid event twice ends in `ALREADY_FINAL` the second time, with nothing changed.
- [ ] A valid event for an unknown provider id, a PENDING status, or another event type returns 200 and changes nothing.
- [ ] Unknown extra fields in the body never cause a 400.
- [ ] The webhook makes no gateway call, and no log line contains the body, the checksum or the secret.

Reconciler

- [ ] A PENDING transaction abandoned for more than 5 min, without a provider id, and with no charge at the gateway ends `EXPIRED`, with its stock released and its delivery `CANCELLED`.
- [ ] A PENDING transaction without a provider id whose charge exists at the gateway gets the provider id stored and is finalized with the gateway's status. It is never expired.
- [ ] A PENDING transaction with a provider id, untouched for more than 1 min, is finalized when the gateway reports a final status, and left PENDING otherwise.
- [ ] A gateway error during (a) or (b) changes no row, and that row is retried after its lease.
- [ ] No gateway call happens while a unit of work is open.
- [ ] A run stops making gateway calls once 30 s have elapsed, and reports the rest as `deferred`.
- [ ] Two concurrent runs never call the gateway for the same transaction (int-spec green 10 runs in a row).
- [ ] A final transaction without an email, finalized more than 5 min ago, is re-published at most once per 5 min, EXPIRED included.
- [ ] `reconcile:once` and the Lambda handler log and return `{ synced, expired, recovered, republished, deferred, failed }`.

Architecture

- [ ] `findByProviderTransactionId` landed in its own PR before the rest.
- [ ] Raw SQL is limited to the three claim statements, under `infrastructure/persistence`, each with an int-spec. `markEmailSent` uses the QueryBuilder.
- [ ] No migration, index, `packages/shared` change or finalizer change.
- [ ] `reconciler.handler.ts` and `reconcile-once.cli.ts` are the only new coverage exclusions.

Quality and CI

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @checkout/api test:cov` and `test:int` exit 0 locally.
- [ ] The webhook and reconciler use cases, `event-checksum.ts` and the parser are ≥ 85 % on all four metrics, and `apps/api` stays ≥ 80 %.
- [ ] The PR shows green `lint`, `typecheck`, `coverage (api)` and `api-integration`.

## Decisions

Spec split and naming

- **Yes:** the phase is split into SPEC 12a (webhook + reconciler) and SPEC 12b (email notifications). The suffix shows they come from the same phase and that 12a goes first. `/spec-impl` derives the branch from the file name, so `spec-12a-api-webhook-and-reconciler` works unchanged.
- **No:** one spec with two parts. It would be ~18 steps across two modules, config and new dependencies, and a SPEC 09 delay would also block the reconciler, which can be tested without Lambda.
- **Yes:** all 4 stubbed repository methods are implemented here, 12b's `markEmailSent` included. They live in `modules/transactions`, which 12b must not touch.
- **Yes:** the clarification ran question by question, and the sections after the header were written in one pass at the user's request.

Webhook

- **Yes:** find the transaction with `findByProviderTransactionId` over the signed `transaction.id`, through a separate contract-change PR. Only signed fields are trusted.
- **No:** `findByReference`. The reference may sit outside `signature.properties`. An attacker could take a validly signed event from their own declined purchase, swap in Ana's reference, and finalize her paid transaction as DECLINED.
- **No:** both lookups with a signed-reference check. It means two new port methods and more branches for a webhook the gateway does not even call (FR-25). The lost-response case it would cover is already resolved by the reconciler's task (b).
- **Yes:** trust the signed status, with no `getCharge` call. A replayed event can only repeat a true status of that same transaction, which ends in `ALREADY_FINAL`.
- **No:** re-fetching the charge. Each webhook would take up to ~25 s during an outage, and its failures would count toward the breaker shared with `POST /transactions`, blocking sales.
- **Yes:** the body is `unknown` and parsed by hand, so the global `ValidationPipe` (`forbidNonWhitelisted`) never rejects the gateway's extra fields.
- **Yes:** hand-written fixtures from the gateway's documented event shape. The spike never captured a webhook, which is recorded as a risk.

Reconciler — safe expiry

- **Yes (deviation from the phase's R2(b)):** before expiring, look the charge up by reference.
  - No charge → `EXPIRED`.
  - A final charge → store the provider id and finalize with its status.
  - A PENDING charge → store the provider id and leave it for task (a).
  - An error → touch nothing.

  This follows `references/data-integrity.md` and SPEC 08's "the reconciler resolves it by reference".
- **No:** expiring directly, as the phase text says. When the POST timed out but the charge was created and approved, Ana would be charged while her two units were released and sold to Luis.

Reconciler — concurrency

- **Yes (resolving a contradiction in the phase):** each claim is one `UPDATE … SET updated_at = now()` over `SELECT … FOR UPDATE SKIP LOCKED`, committed at once. The bumped `updated_at` is a lease, so a concurrent run skips those rows although no lock is held during gateway calls.
- **No:** holding the lock during gateway calls. It breaks R2 (SPEC 10), and Ana's polling GET would wait up to 25 s on the locked row and hit API Gateway's 29 s limit.
- **No:** releasing the lock and accepting duplicates. The data stays correct through the conditional finalize, but it doubles gateway calls on a slow day, can open the breaker and block new sales, and fails the phase's R4 test.
- **Yes:** a 30 s time budget per run, with batches of 20. One worst-case call (~25 s) after the budget still ends before the 60 s lease, so a run can never outlive its own lease. Unreached rows are reported as `deferred`.
- **No:** a 10 min lease. A transaction still PENDING at the gateway would be rechecked only every 10 min, delaying Ana's email.
- **No:** parallel gateway calls. It hits a slow gateway five times harder and opens the breaker sooner.

Reconciler — re-publish

- **Yes:** `findUnsentEmails` is implemented as a leased claim (5 min), so a transaction is re-published at most once every 5 min. The port signature is unchanged, and the comment documents the side effect.
- **No:** re-publishing on every run. A 30 min Gmail outage with 10 transactions would enqueue 300 duplicates and fill the DLQ, firing its alarm for a problem that is only Gmail.
- **Yes (deviation from FR-23's list):** EXPIRED transactions get an email too, and task (c) re-publishes every final status. SPEC 11's screen promises "Te avisaremos por correo" after 60 s, and EXPIRED is exactly the case where the customer is left waiting. The phase lists the EXPIRED template. The template itself is SPEC 12b's.

Running it

- **Yes:** the reconciler is its own Lambda (same bundle, entry `workers/reconciler.handler.ts`), invoked by EventBridge Scheduler every minute and running Nest as an application context without HTTP. Creating it in AWS belongs to infra 06.
- **Yes:** a `reconcile:once` command for local manual tests, run through `nest start --entryFile` because `tsx` emits no decorator metadata and Nest DI would fail.
- **Yes:** the Lambda handler step is last and waits for SPEC 09 (`load-secrets.ts`, `build:lambda`). Everything before it is testable locally.

## Risks

| Risk | Mitigation |
| --- | --- |
| The real webhook payload differs from the documented shape (property paths, timestamp type, header name). | The parser is defensive and returns `null` → 401 on anything unexpected. Fixtures are isolated in `__fixtures__/`. The webhook is not registered in the shared account (FR-25), so a mismatch cannot affect payments. Recorded for checkpoint C3. |
| The lease relies on `updated_at`. Another code path that bumps `updated_at` on a PENDING row would delay its sync by up to 1 min. | Only `recordGatewayResponse` and the finalizer write PENDING rows, and both are intended. The claim int-spec documents the semantics. |
| A run is killed mid-way (Lambda timeout, crash) after claiming rows. | The lease expires on its own, and another run picks the rows up within 1–2 min. Nothing needs manual release. |
| `findChargeByReference` returns a charge whose amount differs from ours (a reused reference or a gateway bug). | References are unique on our side, and the gateway echoes our reference. Checking the amount is noted as a follow-up and is not in this spec. |
| Integration tests pass without real concurrency (the promises serialize). | The fake gateway delays 200 ms per call, so both runs are in flight together. The assertion is on disjoint id sets. The spec runs 10 times in a row. |
| `nest start --entryFile` for `reconcile:once` resolves the entry differently than expected. | Verified in step 10's manual test. The fallback is `nest build` followed by `node dist/workers/reconcile-once.cli.js`. |
| SPEC 09 slips and step 11 cannot run. | Steps 1–10 are independent of it. Step 11 waits, and the spec is not marked `Implemented` until it lands. |
| Re-publish sends events for transactions whose email the worker (SPEC 12b) will skip, if 12b decides a status gets no template. | Decided here: every final status, EXPIRED included, gets an email. SPEC 12b must provide all 5 templates. |

## What is **not** in this spec

- The SQS publisher, the email worker, the email use case, the templates and the SMTP adapters (SPEC 12b).
- The AWS resources for the reconciler and the queue (infra 06).
- Registering the webhook with the gateway.
- Throttling exclusions (api 07).
- Webhook lookup by reference, and re-fetching charges inside the webhook.
- Migrations, new indexes, and changes to `packages/shared`, other frozen ports, the finalizer, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.

Each of these, if it lands, goes in its own spec.
