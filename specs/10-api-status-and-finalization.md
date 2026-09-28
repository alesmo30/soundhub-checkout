# SPEC 10 — API: transaction status and finalization

> **Status:** Approved
> **Depends on:** SPEC 08 (blocking: must be merged into `main` — release-only `FinalizeTransactionUseCase`, transaction / delivery / stock repositories, `HttpPaymentGatewayAdapter.getCharge`, `TransactionsModule` wiring), SPEC 04 (product, warehouse and municipality repositories), SPEC 02 (frozen `EventPublisher` port, `UnitOfWork`)
> **Date:** 2026-09-27
> **Objective:** A PENDING transaction reaches its final status exactly once, whoever notices first — `GET /transactions/:id` syncs it with the payment gateway, the finalization commits or releases stock idempotently and publishes `transaction.finalized`, and `GET /deliveries/:id` shows where the order ships from and to.

> Source phase file: `phases/sunday/api/04-payment.2-status-and-finalization.md`.

## Scope

**In:**

Finalization (extends SPEC 08's `FinalizeTransactionUseCase`)

- The **APPROVED branch**, in the same `UnitOfWork` as today: `transactions.finalize` → `stock.commit` (`reserved − q`) → `deliveries.transition(READY_TO_SHIP)`.
- The release branch (DECLINED / VOIDED / ERROR / EXPIRED) stays as SPEC 08 left it: `available + q`, `reserved − q`, delivery `CANCELLED`.
- **Event publishing after the commit**, only when the outcome is `FINALIZED`: `transaction.finalized` with `transactionId` and `status`.
  - A publish error is logged at `warn` and the use case still returns `FINALIZED`.
  - `ALREADY_FINAL` publishes nothing.
- The throw on `APPROVED` that SPEC 08 left in place is removed.
- The return type stays `ResultAsync<'FINALIZED' | 'ALREADY_FINAL', never>`.
- The use case never calls the gateway. It receives an outcome that was already fetched.

Event publisher

- `InMemoryEventPublisher` in `shared/infrastructure/messaging/`. It implements the frozen `EventPublisher` port.
  - It logs the event at `info` and returns `Ok`.
  - It has no subscribers and keeps no state.
- It is bound as `EVENT_PUBLISHER` in `TransactionsModule`. api 06 swaps that binding for the SQS adapter.

`GET /api/v1/transactions/:id`

- `GetTransactionStatusUseCase`. `execute()` reads as a table of contents of three private phases:
  1. **Load.** `findById` returns null → 404 `TRANSACTION_NOT_FOUND`.
  2. **Sync.** This phase runs only when the transaction is PENDING **and** has a `provider_transaction_id`. It calls `gateway.getCharge` **before** any unit of work opens. What happens next depends on the result:
     - a final status → `FinalizeTransactionUseCase`, then re-read the transaction;
     - PENDING → keep the stored state;
     - `Err` (timeout, 5xx, breaker open) → log at `warn` and keep the stored state.
  3. **Present.** Read the product and the delivery, and map them to `TransactionView`. A missing product or delivery is a data inconsistency, so the use case logs an `error` and rejects (500 `INTERNAL_ERROR`).
- Response: 200 `{ data: TransactionView }` with `Cache-Control: no-store`, plus `Retry-After: 2` while the returned status is PENDING.
- Errors: 400 for a non-uuid-v4 id, 404 `TRANSACTION_NOT_FOUND`.
- The response never carries the customer's email or document number.

`GET /api/v1/deliveries/:id`

- `GetDeliveryUseCase` reads the delivery, then its warehouse, then the warehouse's municipality and the destination municipality. It maps them to `DeliveryView`.
  - A missing delivery → 404 `DELIVERY_NOT_FOUND`.
  - A missing warehouse or municipality → logged `error` and a rejection (500).
- Response: 200 `{ data: DeliveryView }` with `Cache-Control: no-store`.
- Errors: 400 for a non-uuid-v4 id, 404 `DELIVERY_NOT_FOUND`.
- `DeliveriesModule` imports `LocationsModule` for `WAREHOUSE_REPOSITORY` and `MUNICIPALITY_REPOSITORY`.

Tests

- Unit: every finalization branch, every sync branch, the delivery view, and the in-memory publisher.
- Controller specs (`configureApp` + supertest + fakes): status codes and headers for both GETs.
- Integration against Postgres:
  - stock numbers after APPROVED and after DECLINED;
  - **three concurrent finalizations** of the same transaction, all APPROVED → one state change, correct stock and one event.
- Manual check with curl against the sandbox: card 4242 ends APPROVED and card 4111 ends DECLINED.

**Out of scope (for future specs):**

- Webhook, reconciler, reservation expiry, the SQS adapter, email sending, and the 4 repository methods SPEC 08 stubbed (api 06).
- The reconciler's schedule. It stays `rate(1 minute)` per FR-24 and belongs to api 06 / infra 06.
- Frontend polling, and treating a 504 on a poll as "still waiting" (web 04).
- Rate limiting (api 07).
- Any change to SPEC 08's gateway constants. The 8 s timeout and `retries: 2` (3 attempts) stay.
- Resolving a PENDING transaction **without** `provider_transaction_id` from the GET. The reconciler looks it up by reference (api 06).
- Reading soft-deleted products or warehouses (`findByIdIncludingDeleted`). No flow deletes them today.
- A concurrency scenario with conflicting statuses (APPROVED vs DECLINED racing).
- Deleting or soft-deleting transactions or deliveries.
- Any new dependency, and any change to `packages/shared`, the frozen ports, ORM entities, migrations, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.

## Data model

This spec adds no tables, columns or migrations. It reuses the SPEC 02 schema, the frozen ports, the `TransactionFinalizedEvent` domain type, and the `TransactionView` / `DeliveryView` contracts from `@checkout/shared/contracts`.

### New and changed files

```
apps/api/src/
├─ shared/infrastructure/messaging/
│  in-memory-event-publisher.ts (+ .spec.ts)
├─ modules/transactions/
│  ├─ transactions.module.ts                          + EVENT_PUBLISHER binding · GetTransactionStatusUseCase
│  ├─ domain/transaction.errors.ts                    + transactionNotFound
│  ├─ application/use-cases/
│  │  finalize-transaction.use-case.ts                ~ APPROVED branch + publish after commit
│  │  get-transaction-status.use-case.ts
│  │  helpers/to-transaction-view.ts
│  └─ infrastructure/
│     ├─ persistence/
│     │  finalize-transaction.int-spec.ts
│     │  finalize-transaction.concurrency.int-spec.ts
│     └─ http/
│        transactions.controller.ts                   + GET ':id'
│        transactions-http.constants.ts               + TRANSACTION_PENDING_RETRY_AFTER_SECONDS
│        dto/{transaction-id.params, transaction-view, transaction-view-response}.dto.ts
└─ modules/deliveries/
   ├─ deliveries.module.ts                            + imports LocationsModule · controller · GetDeliveryUseCase
   ├─ domain/delivery.errors.ts
   ├─ application/use-cases/
   │  get-delivery.use-case.ts
   │  helpers/to-delivery-view.ts
   └─ infrastructure/http/
      deliveries.controller.ts · deliveries-http.constants.ts
      dto/{delivery-id.params, delivery-view, delivery-view-response}.dto.ts
```

Unit specs (`*.spec.ts`) sit next to every use case, helper, error factory and controller.

### Constants

```ts
// transactions/infrastructure/http/transactions-http.constants.ts
export const TRANSACTION_PENDING_RETRY_AFTER_SECONDS = POLL_INTERVAL_MS / 1_000;   // 2, from @checkout/shared
// TRANSACTIONS_CACHE_CONTROL = 'no-store' already exists (SPEC 08)

// deliveries/infrastructure/http/deliveries-http.constants.ts
export const DELIVERIES_CACHE_CONTROL = 'no-store';
```

### Event

```ts
// Built by FinalizeTransactionUseCase after the unit of work commits, only on FINALIZED
const event: TransactionFinalizedEvent = {
  type: 'transaction.finalized',
  transactionId: '7f3c…',
  status: 'APPROVED',            // the FinalStatus that won the conditional UPDATE
  occurredAt: clock.now(),
};
// InMemoryEventPublisher logs: event published {"type":"transaction.finalized","transactionId":"7f3c…","status":"APPROVED",…}
```

### Errors

```ts
// transactions/domain/transaction.errors.ts
export function transactionNotFound(id: string): DomainError;   // TRANSACTION_NOT_FOUND, NOT_FOUND

// deliveries/domain/delivery.errors.ts
export function deliveryNotFound(id: string): DomainError;      // DELIVERY_NOT_FOUND, NOT_FOUND
```

### Use cases

```ts
FinalizeTransactionUseCase.execute(outcome: { id: string; status: FinalStatus; statusMessage: string | null })
  : ResultAsync<'FINALIZED' | 'ALREADY_FINAL', never>
//   UnitOfWork: transactions.finalize → null ? ALREADY_FINAL
//                                     : APPROVED ? stock.commit + transition(READY_TO_SHIP)
//                                                : stock.release + transition(CANCELLED)
//   after commit, on FINALIZED: eventPublisher.publish(event); Err → logger.warn, still FINALIZED

GetTransactionStatusUseCase.execute(id: string): ResultAsync<TransactionView, DomainError>
//   execute() = load → sync → present   (each phase a private method, C3 exception)

GetDeliveryUseCase.execute(id: string): ResultAsync<DeliveryView, DomainError>

// helpers (mechanical)
toTransactionView(input: { transaction: Transaction; product: Product; delivery: Delivery }): TransactionView
toDeliveryView(input: {
  delivery: Delivery; warehouse: Warehouse;
  warehouseMunicipality: Municipality; destination: Municipality;
}): DeliveryView
```

### Sync decision table (`GetTransactionStatusUseCase.sync`)

| Stored status | `provider_transaction_id` | Gateway result | Does | Response status |
|---|---|---|---|---|
| final | any | not called | — | stored final |
| PENDING | null | not called | — (the reconciler resolves it by reference) | PENDING + `Retry-After: 2` |
| PENDING | set | `Ok`, PENDING | — | PENDING + `Retry-After: 2` |
| PENDING | set | `Ok`, final | finalize, then re-read | whatever the re-read shows |
| PENDING | set | `Err` (TIMEOUT / UNAVAILABLE / REJECTED) | `warn` log `{ transactionId, kind }` | PENDING + `Retry-After: 2` |

The re-read after finalize matters: if the webhook or the reconciler finalized first, the finalizer returns `ALREADY_FINAL`, and the response shows the status that actually won.

### HTTP

| Endpoint | Case | Status | Headers |
|---|---|---|---|
| `GET /transactions/:id` | PENDING | 200 | `Cache-Control: no-store`, `Retry-After: 2` |
| `GET /transactions/:id` | final | 200 | `Cache-Control: no-store` |
| `GET /transactions/:id` | unknown id | 404 `TRANSACTION_NOT_FOUND` | — |
| `GET /deliveries/:id` | found | 200 | `Cache-Control: no-store` |
| `GET /deliveries/:id` | unknown id | 404 `DELIVERY_NOT_FOUND` | — |
| both | id not uuid v4 | 400 `VALIDATION_ERROR` | — |

The success headers are set through `@Res({ passthrough: true })` **after** `respond()` resolves. This follows `ProductsController`, so they never leak onto a 400 or 404.

## Implementation plan

Prerequisites (not commits):

- SPEC 08 is merged into `main`. `/spec-impl` then creates `spec-10-api-status-and-finalization` from the updated `main`.
- `docker compose up -d postgres && pnpm --filter @checkout/api migration:run` before step 3.
- `.env` has the sandbox `PAYMENT_GATEWAY_*` values. Only step 9's manual check uses them.

Each step is one commit after review. Target: ≤ ~300 changed lines per step. Pushing and opening PRs happen only when the user asks.

### Finalization

1. [x] **In-memory event publisher.** `InMemoryEventPublisher` in `shared/infrastructure/messaging/`, bound as `EVENT_PUBLISHER` in `TransactionsModule`. The unit spec checks, with a captured logger:
   - `publish` returns `Ok`;
   - the log line carries the event's `type`, `transactionId` and `status`.

   Manual test: `pnpm --filter @checkout/api test` green, and `pnpm dev` boots with no DI error.
   Commit: `feat(api): add in-memory event publisher`.

2. [x] **Approved branch and event publishing.** This step starts by reading SPEC 08's `finalize-transaction.use-case.ts` on `main` and adapting to its actual names. It then adds the APPROVED branch, injects `EVENT_PUBLISHER` and `CLOCK`, publishes after the commit, and removes the APPROVED throw. The unit specs, over fake ports and a fake `UnitOfWork`, cover:
   - `APPROVED` → `finalize`, `commit` and `transition(READY_TO_SHIP)` inside one `run`, then 1 publish with `status: 'APPROVED'`, returning `FINALIZED`;
   - each of `DECLINED` / `VOIDED` / `ERROR` / `EXPIRED` → `release` and `transition(CANCELLED)`, then 1 publish with that status;
   - `ALREADY_FINAL` → no stock call, no transition and no publish;
   - the publish happens only after `run` resolves (call-order assertion);
   - a publish `Err` → 1 `warn` log, and the result is still `FINALIZED`.

   Manual test: `test` green.
   Commit: `feat(api): finalize approved transactions and publish transaction.finalized`.

3. [ ] **Finalization stock numbers against Postgres.** `finalize-transaction.int-spec.ts` runs the real use case, SPEC 08's repositories, `TypeOrmUnitOfWork` and a counting fake publisher. The setup creates a product with stock `10 / 0` and a random SKU, plus a customer with a random email. It then reserves 2 units and inserts a PENDING transaction and an AWAITING_PAYMENT delivery in one unit of work. The spec proves:
   - `APPROVED` → stock `8 / 0`, transaction `APPROVED` with `finalized_at` set, delivery `READY_TO_SHIP`, 1 event;
   - `DECLINED` (fresh setup) → stock `10 / 0`, delivery `CANCELLED`, 1 event;
   - a second finalize of the same transaction → `ALREADY_FINAL`, with stock unchanged and no second event.

   The test products are soft-deleted in a `finally`.
   Manual test: `pnpm --filter @checkout/api test:int` green.
   Commit: `test(api): prove finalization stock numbers against Postgres`.

4. [ ] **Concurrent finalization proof.** `finalize-transaction.concurrency.int-spec.ts` uses the same setup as step 3. It fires **3** `execute({ status: 'APPROVED' })` calls in parallel, each through its own `TypeOrmUnitOfWork`. It proves:
   - exactly 1 `FINALIZED` and 2 `ALREADY_FINAL`;
   - stock `8 / 0`;
   - delivery `READY_TO_SHIP`;
   - the counting publisher saw exactly 1 event.

   The setup checks that the pool size is ≥ 3. The product is soft-deleted in a `finally`.
   Manual test: `for i in $(seq 10); do pnpm --filter @checkout/api test:int -- finalize-transaction.concurrency || break; done`. All 10 runs are green.
   Commit: `test(api): prove concurrent finalizations change state once`.

### Transaction status

5. [ ] **Get transaction status use case.** `transactionNotFound`, `helpers/to-transaction-view.ts` and `GetTransactionStatusUseCase` (load → sync → present). The use case injects the transaction repository, the payment gateway, `FinalizeTransactionUseCase`, `PRODUCT_REPOSITORY` and `DELIVERY_REPOSITORY`. The unit specs cover every row of the sync decision table, plus:
   - an unknown id → `TRANSACTION_NOT_FOUND`;
   - a gateway final status → finalize called with `{ id, status, statusMessage }`, and the response built from the re-read;
   - `getCharge` resolves before finalize is called, and the use case never opens a `UnitOfWork` itself;
   - a missing product or delivery → 1 `error` log and a rejection;
   - `toTransactionView` output has exactly the `TransactionView` keys, with dates as ISO strings and no `email` or `documentNumber` anywhere.

   Manual test: `test` green.
   Commit: `feat(api): add get transaction status use case with gateway sync`.

6. [ ] **GET /transactions/:id.** `transaction-id.params.dto.ts`, `transaction-view.dto.ts` and `transaction-view-response.dto.ts` (they implement `TransactionView`), `TRANSACTION_PENDING_RETRY_AFTER_SECONDS`, the `@Get(':id')` handler and the `TransactionsModule` provider. `transactions.controller.spec.ts` checks:
   - PENDING → 200, `Cache-Control: no-store` and `Retry-After: 2`;
   - APPROVED → 200 with no `Retry-After`;
   - a non-uuid id → 400 `VALIDATION_ERROR`;
   - an unknown id → 404 `TRANSACTION_NOT_FOUND`, with neither `Retry-After` nor `no-store` leaking onto it;
   - the body has no `email` or `documentNumber` key at any depth.

   Manual test: `/api/docs` shows `GET /transactions/{id}` with the `TransactionView` schema.
   Commit: `feat(api): expose GET /transactions/:id`.

### Delivery

7. [ ] **Get delivery use case.** `deliveryNotFound`, `helpers/to-delivery-view.ts`, `GetDeliveryUseCase`, and `DeliveriesModule` importing `LocationsModule`. The unit specs cover:
   - found → a `DeliveryView` with the warehouse name, the warehouse municipality name, and the destination municipality and department names;
   - an unknown id → `DELIVERY_NOT_FOUND`;
   - a missing warehouse, warehouse municipality or destination municipality → 1 `error` log and a rejection;
   - a null `addressDetail` stays `null`.

   Manual test: `test` green.
   Commit: `feat(api): add get delivery use case`.

8. [ ] **GET /deliveries/:id.** `delivery-id.params.dto.ts`, `delivery-view.dto.ts`, `delivery-view-response.dto.ts`, `deliveries-http.constants.ts`, `deliveries.controller.ts`, and the controller and use case registered in `DeliveriesModule`. `deliveries.controller.spec.ts` checks:
   - 200 with `Cache-Control: no-store` and the `DeliveryView` envelope;
   - a non-uuid id → 400;
   - an unknown id → 404 `DELIVERY_NOT_FOUND`, with no `no-store` on it.

   Manual test: `/api/docs` shows `GET /deliveries/{id}`.
   Commit: `feat(api): expose GET /deliveries/:id`.

### Close-out

9. [ ] **Sandbox check, coverage and CI.**
   - **Card 4242**, against the local API with sandbox keys. Tokenize the card and fetch fresh acceptance tokens with curl, then `POST /transactions`. Then poll `GET /transactions/:id` every 2 s. Expect:
     - `PENDING` with `Retry-After: 2`, then `APPROVED`;
     - the product's `stock_reserved` back to its value before the purchase;
     - an `event published … "status":"APPROVED"` log line;
     - `GET /deliveries/:id` returns `READY_TO_SHIP` with warehouse and destination names.
   - **Card 4111**, same flow. Expect `DECLINED`, the stock equal to its value before the purchase, and the delivery `CANCELLED`.
   - Run `test:cov` and check that `modules/transactions` is ≥ 85 % and `modules/deliveries` is ≥ 80 % on all four metrics.
   - When the user asks, push and open the PR with `gh-cli`, wait for CI, and fix whatever fails.
   - Finally, mark this spec `Implemented`.

   Manual test: every check green.
   Commit: `docs: mark spec 10 as Implemented`.

Notes:

- A CI fix in step 9 goes in its own `fix: …` commit, after review.
- If a frozen port or a `packages/shared` contract turns out to be wrong, stop and apply the contract-change protocol.
- Checkpoint C3 (the full flow through the web UI) runs after web 04. It is not part of this spec.

## Acceptance criteria

Finalization

- [ ] Starting from stock `10 / 0` and a 2-unit PENDING transaction (`8 / 2`), `APPROVED` leaves stock `8 / 0` and the delivery `READY_TO_SHIP` (int-spec).
- [ ] From the same start, `DECLINED` leaves stock `10 / 0` and the delivery `CANCELLED` (int-spec).
- [ ] `VOIDED`, `ERROR` and `EXPIRED` take the same release path as `DECLINED` (unit specs).
- [ ] A finalized transaction has `finalized_at` set and `provider_status_message` equal to the outcome's `statusMessage`.
- [ ] Finalizing an already-final transaction returns `ALREADY_FINAL`, changes no row and publishes nothing.
- [ ] Three concurrent `APPROVED` finalizations of one transaction end with 1 `FINALIZED`, 2 `ALREADY_FINAL`, stock `8 / 0`, delivery `READY_TO_SHIP` and exactly 1 event. The int-spec is green 10 runs in a row.
- [ ] `transaction.finalized` is published after the unit of work commits, only on `FINALIZED`, with the winning status.
- [ ] A failing publish leaves the finalization committed, logs 1 `warn`, and the use case returns `FINALIZED`.
- [ ] The rejected-charge path of `POST /transactions` (SPEC 08) still ends `ERROR` with stock released, and now also publishes 1 event.

`GET /transactions/:id`

- [ ] A PENDING transaction with a provider id that the gateway reports as APPROVED is returned as `APPROVED` in the same response, with stock and delivery already moved.
- [ ] A PENDING transaction returns 200 with `Retry-After: 2` and `Cache-Control: no-store`. A final one returns `no-store` without `Retry-After`.
- [ ] A PENDING transaction without a provider id is returned PENDING without calling the gateway.
- [ ] A final transaction is returned without calling the gateway.
- [ ] A gateway timeout, 5xx or open breaker during sync returns 200 PENDING with `Retry-After: 2`, not an error.
- [ ] The gateway is never called inside an open `UnitOfWork` (unit-spec assertion).
- [ ] The body has exactly the `TransactionView` fields, and no `email` or `documentNumber` at any depth.
- [ ] An unknown id returns 404 `TRANSACTION_NOT_FOUND`, and a non-uuid-v4 id returns 400.

`GET /deliveries/:id`

- [ ] It returns 200 `{ data: DeliveryView }` with warehouse name, warehouse municipality name, and destination municipality and department names, plus `Cache-Control: no-store`.
- [ ] An unknown id returns 404 `DELIVERY_NOT_FOUND`, and a non-uuid-v4 id returns 400.

Architecture

- [ ] `InMemoryEventPublisher` lives in `shared/infrastructure/messaging/`, implements `EventPublisher`, and is bound as `EVENT_PUBLISHER` in `TransactionsModule`.
- [ ] No new raw SQL is added. Finalization reuses SPEC 08's statements.
- [ ] SPEC 08's gateway constants (8 s timeout, `retries: 2`) are unchanged.
- [ ] `apps/api/package.json`, `pnpm-lock.yaml`, `packages/shared`, the frozen ports and the migrations are unchanged.
- [ ] No transaction or delivery row is deleted or soft-deleted by this spec's code.

Quality and CI

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @checkout/api test:cov` and `test:int` exit 0 locally.
- [ ] Coverage shows `modules/transactions` ≥ 85 % and `modules/deliveries` ≥ 80 % on statements, branches, functions and lines, and `apps/api` stays ≥ 80 % globally.
- [ ] Sandbox manual check: card 4242 ends `APPROVED` with stock committed and the delivery `READY_TO_SHIP`. Card 4111 ends `DECLINED` with stock restored and the delivery `CANCELLED`.
- [ ] The PR shows green `lint`, `typecheck`, `coverage (api)` and `api-integration`.

## Decisions

Spec and branch

- **Yes:** SPEC 10 with branch `spec-10-api-status-and-finalization`, created by `/spec-impl` from `main` once SPEC 08 is merged. SPEC 09 is `infra-first-deploy`.
- **No:** `feat/04.2-api-status-and-finalization` from the phase file. Earlier specs settled on `spec-NN-slug`.
- **No:** a branch stacked on `spec-08-api-create-transaction`. This spec edits the same files (`finalize-transaction.use-case.ts`, `transactions.module.ts`), so every SPEC 08 review change would force a rebase with conflicts.
- **Yes:** the clarification ran question by question, and sections 2–7 were written in one pass at the user's request after the header was approved.

Event publishing

- **Yes:** publish after the commit, only on `FINALIZED`. A publish error is logged and swallowed. The api 06 reconciler republishes any final transaction whose `email_sent_at` is still null after 5 min, so a lost event heals itself.
- **No:** publishing inside the unit of work. With SQS it would be a network call while row locks are held, which the phase's R2 forbids.
- **No:** failing the use case when the publish fails. The stock and status are already committed, so the client would see an error for a payment that succeeded, and might pay again.
- **Yes:** the in-memory publisher only logs. api 06 swaps the binding for SQS, and tests count events with a fake publisher.
- **No:** in-process subscribers. `subscribe()` is not in the frozen port, and api 06's consumer is a worker that reads SQS, so the code would be thrown away.
- **No:** storing events in an array. It grows without bound in a long-lived Lambda and mixes test concerns into the real adapter.
- **Yes:** `EVENT_PUBLISHER` is bound in `TransactionsModule`, like SPEC 08's `UNIT_OF_WORK` and `CLOCK`. It is the only module that publishes.
- **Yes:** the rejected-charge path of SPEC 08 now publishes too, because it goes through the same use case. api 06 decides which statuses send an email.

Gateway sync

- **Yes:** the status use case fetches the gateway status, and only then calls the finalizer, which opens the unit of work. The finalizer never calls the gateway, so no network call happens while locks are held (R2).
- **Yes:** a sync failure returns 200 with the stored PENDING and `Retry-After: 2`. The last thing we know is PENDING, and the next poll or the reconciler resolves it.
- **No:** 503 `PAYMENT_GATEWAY_UNAVAILABLE` on the GET. The card may already be charged, and an error screen invites a second payment.
- **No:** `Retry-After: 30` while the breaker is open. With the 60 s poll budget the frontend would only ask once or twice, and it would need to know the breaker state.
- **Yes:** keep SPEC 08's 8 s timeout and `retries: 2` (3 attempts). Only the first 1–2 requests during an outage wait that long. After 5 failures the breaker opens and later syncs fail instantly.
- **No:** raising the timeout to 20 s. Three attempts would take ~60 s, past API Gateway's 29 s limit, so every sync during an outage would end in a 504. It also does not make the payment settle faster: the spike showed each call answers quickly, and the ~6–9 s wait to a final status is absorbed by polling.
- **No:** lowering GET retries to 1. It was considered to widen the margin under 29 s. It was discarded to leave SPEC 08 untouched and keep the extra retry for the reconciler, and the occasional 504 is accepted as a risk.
- **Yes:** re-read the transaction after finalizing, so the response shows the status that actually won the race.
- **Yes:** a PENDING transaction without a provider id is not synced from the GET. The phase scopes sync to transactions with `provider_transaction_id`, and a lookup by reference every 2 s is the reconciler's job (api 06).

Views

- **Yes:** a missing product, delivery, warehouse or municipality is logged as `error` and becomes 500. No flow soft-deletes them today, so it can only happen through a manual DB change, which should be loud.
- **No:** `findByIdIncludingDeleted` on the product and warehouse ports. It is a frozen-port change with its own PR, for a case that does not happen yet. It belongs to whatever spec adds "discontinue product".
- **No:** placeholder data ("Producto no disponible"). It shows invented data and hides the inconsistency.
- **Yes:** success headers are set after `respond()` resolves, following `ProductsController`, so `Retry-After` and `no-store` never appear on a 400 or 404.

Testing

- **Yes:** one concurrency scenario, the one the phase asks for: 3 concurrent `APPROVED` finalizations → 1 change, correct stock, 1 event, green 10 runs in a row.
- **No:** a second scenario with conflicting statuses. The gateway never reports two final statuses for one charge, and the user chose to keep the test to the phase's scope.
- **Yes:** a separate int-spec with exact stock numbers for APPROVED and DECLINED, so the concurrency test is not the only proof of the SQL.
- **Yes:** a manual curl check against the sandbox with 4242 and 4111 before closing. A mapping bug against the real gateway shows up here, not mixed with web 04's issues.

Out of this spec

- **Yes:** the reconciler keeps `rate(1 minute)` (FR-24). Two minutes saves nothing, since both fit in the free tier, and it keeps abandoned reservations blocked up to 7 min instead of 6. Changing it would belong to api 06 / infra 06.

## Risks

| Risk | Mitigation |
| --- | --- |
| SPEC 08 merges with different names or shapes than assumed (`FinalizeTransactionUseCase` signature, the `CLOCK` binding, controller or constants file names). | Step 2 starts by reading the merged files on `main`. Adapt names, not shape. |
| During a gateway outage, one GET can take ~25 s (3 × 8 s plus backoff), and with a Lambda cold start it can pass API Gateway's 29 s limit and return 504. | Accepted. Only the first 1–2 requests pay it before the breaker opens. The GET is read-only and the finalizer is idempotent, so the next poll recovers. Web 04 must treat a 504 during polling as "still waiting". |
| The concurrency int-spec passes without really racing, because the calls run one after another. | Each call gets its own `TypeOrmUnitOfWork`, the setup checks the pool size is ≥ 3, the assertion is on final stock numbers and the event count, and the spec runs 10 times in a row. |
| A lost event (publish failure) means no email until api 06 lands. | Accepted for this phase. The in-memory publisher cannot fail in practice, and api 06's reconciler republishes events with `email_sent_at IS NULL`. |
| The gateway reports APPROVED for a transaction already final locally as `ERROR` or `EXPIRED`, so money moved but stock was released. | The conditional UPDATE ignores it, so the state never flips. `EXPIRED` only applies to transactions that never reached the gateway (api 06), and the spike confirmed a 4xx creates no charge. Detecting and alerting on such a mismatch belongs to api 06. |
| Each poll of a PENDING transaction calls the gateway (up to ~30 calls in 60 s per open checkout). | Accepted at this scale. The breaker protects the gateway during outages, and the poll stops as soon as the status is final. |
| `GET /transactions/:id` has no authentication, so anyone with the id sees the amounts, card brand and last 4. | Per the contract: ids are random uuid v4, and the response never includes the email or document number. |
| Test customers and transactions from the int-specs accumulate in the local DB. | Test products are soft-deleted in a `finally`, so the catalog stays clean. Transactions are financial records and are never deleted (`references/data-integrity.md`). |

## What is **not** in this spec

- Webhook, reconciler (and its schedule), reservation expiry, the SQS adapter, email, and SPEC 08's 4 stubbed repository methods (api 06).
- Frontend polling and its 504 handling (web 04).
- Rate limiting (api 07).
- Changes to SPEC 08's gateway timeout or retries.
- Syncing a PENDING transaction without a provider id from the GET.
- Reading soft-deleted products or warehouses.
- A conflicting-status concurrency scenario.
- Any deletion of transactions or deliveries.
- New dependencies, and changes to `packages/shared`, frozen ports, ORM entities, migrations, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.

Each of these, if it lands, goes in its own spec.
