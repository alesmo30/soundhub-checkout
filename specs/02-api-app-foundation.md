# SPEC 02 — API: app foundation (Nest bootstrap, persistence, frozen ports and seeds)

> **Status:** Implemented
> **Depends on:** SPEC 01 (blocking: api 02 starts only after this spec merges; web 01 runs in parallel)
> **Date:** 2026-09-26
> **Objective:** Stand up the NestJS API with every cross-cutting concern wired in, the full schema created by migrations with its ORM entities and frozen ports, and an idempotent seed that fills the database like the real store.

## Scope

**In:**

Part 1 — Nest bootstrap

- `apps/api` tooling: `package.json` (scripts `build`, `start`, `start:dev`, `typecheck`, `test`, `test:cov`, `test:int`, `migration:run`, `migration:revert`, `migration:generate`, `seed`, `seed:reset`), `tsconfig.json` + `tsconfig.build.json`, `nest-cli.json` (webpack mode + `@nestjs/swagger` CLI plugin), `webpack.config.cjs` (`webpack-node-externals` allowlisting `/^@checkout\//`), `jest.config.ts` (`@swc/jest` with decorator metadata, 80% threshold) and `eslint.config.mjs` with the boundary rules.
- `src/config/`: an `EnvironmentVariables` class validated with `class-validator` at startup, covering every group in `.env.example` (`db`, `app`, `paymentGateway`, `smtp`), all required, exposed as a typed `AppConfig`. It is the only reader of `process.env`.
- `src/main.ts` plus a reusable `configureApp(app)`: prefix `api/v1`, global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform, stopAtFirstError false), `helmet` (default CSP, relaxed only on `/api/docs`), body limit `100kb`, and Swagger at `/api/docs` in every environment.
- `RequestIdMiddleware`: it accepts an incoming `X-Request-Id` matching `^[A-Za-z0-9._-]{1,128}$`, otherwise generates a uuid v4, and always echoes it back.
- `src/shared/domain`: `DomainError` base discriminated by `code: ErrorCode`, and `Result` helpers over `neverthrow`.
- `src/shared/infrastructure/http`: `DomainErrorMapper`, a global `ProblemDetailsFilter` (RFC 9457, `traceId`, `errors[]` on 400, bare 500 on unknown errors) and a controller helper that unwraps `ResultAsync`.
- `src/shared/infrastructure/logging`: `nestjs-pino` with `redact` over `cardToken`, `acceptanceToken`, `personalAuthToken`, `documentNumber`, `email`, `phone` and `authorization`. `pino-pretty` is used only when `NODE_ENV=development`; JSON everywhere else.
- `src/shared/infrastructure/resilience`: `withTimeout`, `retryWithBackoff` (exponential + jitter) and `CircuitBreaker` (closed / open / half-open).
- Seven module shells (`catalog`, `locations`, `pricing`, `customers`, `transactions`, `deliveries`, `notifications`) registered in `app.module.ts`.
- `GET /api/v1/health` → `{ data: { status: 'ok' } }`.

Part 2 — persistence and frozen ports

- One hand-written `InitialSchema` migration that reproduces `docs/design/01-data-model.md` §3 verbatim. `synchronize` is always off.
- A TypeORM `DataSource` shared by the Nest module and the CLI (run through `tsx`).
- ORM entities for the 6 tables, with explicit column types, `@DeleteDateColumn`, `@UpdateDateColumn`, a `bigint → number` transformer that rejects unsafe integers, and a `numeric → number` transformer for coordinates.
- Decorator-free domain data types (`readonly`) per module: `Product`, `Municipality`, `Warehouse`, `Customer`, `Transaction`, `Delivery`.
- `UnitOfWork` port with an opaque `TxContext`. `TypeOrmUnitOfWork` commits on `Ok` and rolls back on `Err`. Repositories narrow the context with `instanceof TypeOrmTxContext`.
- Eleven frozen ports with their DI tokens: `ProductRepository`, `StockReservationPort`, `MunicipalityRepository`, `WarehouseRepository`, `CustomerRepository`, `TransactionRepository`, `DeliveryRepository`, `PaymentGatewayPort`, `EventPublisher`, `EmailSender` and `Clock`. All return `ResultAsync`, respect C1, and take `tx` as required on writes and optional on reads.
- `/health` adds `SELECT 1`: 200 with `database: 'up'`, or 503 with `{ data: { status: 'ok', database: 'down' } }`.
- Integration harness: `jest.int.config.ts`, `*.int-spec.ts`, `maxWorkers: 1`, a `globalSetup` that applies pending migrations to the docker-compose `checkout` database, and tests that prove each CHECK constraint.

Part 3 — seeds

- `seeds/scripts/convert-divipola.ts`: it downloads the geolocated DIVIPOLA CSV from a fixed URL and writes `municipalities.json`, including the non-municipalized areas and `isMetroArea: true` for the 10 Aburrá Valley codes. The raw CSV is not committed.
- `warehouses.json` (Medellín, Bogotá, Cali, Barranquilla, with fixed UUIDs, real addresses and coordinates) and `products.json` (15 headphones, SKU `HP-<BRD>-<MODEL>`, Spanish descriptions, COP prices in cents with VAT included, varied stock including 0 and 1, `image_url` = `/images/products/<sku>-640.webp`).
- `runSeed(dataSource)`: exported, one DB transaction, municipalities → warehouses → products, insert-only (`ON CONFLICT DO NOTHING`). A thin `seed` CLI wraps it.
- `seed:reset`: resets `price_cents` and `stock_available` of the 15 seeded products to their seed values. It refuses to run when `NODE_ENV=production` or when any `PENDING` transaction exists, and it never touches `stock_reserved`, municipalities or warehouses.

**Out of scope (for future specs):**

- Repository implementations, use cases, DTOs and every business endpoint (api 02 onwards).
- `lambda.ts`, the workers and the migrator Lambda that will call `runSeed` (infra 05 / infra 09).
- Product image files (web 02) and uploading them to S3.
- Rate limiting and the throttler (API Gateway / api 07), and the Postman collection.
- The in-memory and SQS `EventPublisher` adapters (api 04.2 / api 06), and the gateway and Nodemailer adapters.
- The HTTP e2e suite in `apps/api/test` against the full `AppModule` with a database.
- Any change to `packages/shared`, `apps/web`, `.github/workflows/ci.yml`, `docs/`, `references/` or the `CLAUDE.md` files (including the outdated "local only" note next to `seed`).

## Data model

The database schema is `docs/design/01-data-model.md` §3, reproduced verbatim by the migration; it is not repeated here. This section freezes the code-level structures.

### `apps/api` layout (new files)

```
apps/api/
├─ package.json · tsconfig.json · tsconfig.build.json · nest-cli.json · webpack.config.cjs
├─ jest.config.ts · jest.int.config.ts · eslint.config.mjs
└─ src/
   ├─ main.ts · app.module.ts
   ├─ config/            environment-variables.ts · app-config.ts · app.constants.ts · config.module.ts
   ├─ shared/
   │  ├─ domain/         domain-error.ts · result.ts · domain-event.ts
   │  ├─ application/ports/  unit-of-work.port.ts · clock.port.ts · event-publisher.port.ts
   │  └─ infrastructure/
   │     ├─ http/        configure-app.ts · request-id.middleware.ts · domain-error.mapper.ts
   │     │               problem-details.filter.ts · respond.ts · health/health.controller.ts
   │     ├─ logging/     logger.module.ts · redact-paths.ts
   │     ├─ resilience/  with-timeout.ts · retry-with-backoff.ts · circuit-breaker.ts
   │     └─ persistence/ data-source.ts · typeorm-unit-of-work.ts · typeorm-tx-context.ts
   │                     transformers.ts · migrations/<ts>-initial-schema.ts
   │                     seeds/{run-seed.ts, seed.cli.ts, seed-reset.cli.ts, data/*.json, scripts/convert-divipola.ts}
   └─ modules/<name>/   <name>.module.ts · index.ts · domain/ · application/ports/ · infrastructure/persistence/*.orm-entity.ts
```

### Config

```ts
export interface AppConfig {
  app: { nodeEnv: 'development' | 'test' | 'production'; port: number; logLevel: LogLevel };
  db: { host: string; port: number; username: string; password: string; name: string };
  paymentGateway: { url: string; publicKey: string; privateKey: string; integritySecret: string; eventsSecret: string };
  smtp: { host: string; port: number; user: string; password: string; from: string };
}
// app.constants.ts
export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';
export const BODY_LIMIT = '100kb';
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
```

### Errors

```ts
export type ErrorKind =
  | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'UNPROCESSABLE'
  | 'RATE_LIMITED' | 'UNAVAILABLE' | 'UNAUTHORIZED';

export class DomainError {
  constructor(readonly code: ErrorCode, readonly kind: ErrorKind, readonly detail: string) {}
}
```

| `kind` | HTTP |
|---|---|
| `VALIDATION` | 400 |
| `UNAUTHORIZED` | 401 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `UNPROCESSABLE` | 422 |
| `RATE_LIMITED` | 429 |
| `UNAVAILABLE` | 503 |
| anything not a `DomainError` | 500 `INTERNAL_ERROR`, fixed detail, no stack |

- The status comes from `kind`, not from `code`. The same code needs two statuses: `PRODUCT_NOT_FOUND` is 404 on `GET /products/:id` and 422 on `GET /quotes`.
- Problem `type` = `https://errors.checkout.dev/<code-in-kebab-case>`. `title` comes from a fixed `code → title` table.
- `ValidationPipe` errors → 400 `VALIDATION_ERROR` with `errors: [{ field, message }]`, using dotted paths for nested fields (`payment.cardLast4`).
- Framework `HttpException`s (unknown route 404, body over limit 413) keep their status and use `code: VALIDATION_ERROR`, since the frozen `ErrorCode` has no generic code.
- `respond(result)` unwraps a `ResultAsync<T, DomainError>` into `{ data: T }` or throws `DomainErrorException`, which the filter maps.

### Logging

Redaction censors to `"[REDACTED]"` at the top level and at one and two levels of nesting (`x`, `*.x`, `*.*.x`) for `cardToken`, `acceptanceToken`, `personalAuthToken`, `documentNumber`, `email` and `phone`, plus `req.headers.authorization`. Every line carries `requestId`. Request bodies are never logged.

### Resilience (pure, time and randomness injectable for tests)

```ts
withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T>   // rejects TimeoutError and aborts
retryWithBackoff<T>(work: () => Promise<T>, options: RetryOptions): Promise<T>
  // RetryOptions { retries; baseDelayMs; maxDelayMs; shouldRetry?(e); random?(); sleep?(ms) }
class CircuitBreaker {           // closed → open after N failures → half-open after openDurationMs → closed on success
  constructor(options: { failureThreshold: number; openDurationMs: number; now?: () => number });
  canRequest(): boolean;
  execute<T>(work: () => Promise<T>): Promise<T>;   // rejects CircuitOpenError while open
}
```

### Domain data types (decorator-free, `readonly` fields)

| Module | Type | Fields |
|---|---|---|
| catalog | `Product` | `id, sku, name, brand, description, priceInCents, imageUrl, stockAvailable, stockReserved, createdAt` |
| locations | `Department` | `code, name` |
| locations | `Municipality` | `code, name, departmentCode, departmentName, latitude, longitude, isMetroArea` |
| locations | `Warehouse` | `id, name, municipalityCode, address, latitude, longitude` |
| customers | `Customer` | `id, documentNumber, email, fullName, phone` |
| transactions | `Transaction` | every `transactions` column in camelCase, money as `…InCents`, nullable columns as `T \| null`, timestamps as `Date` |
| deliveries | `Delivery` | every `deliveries` column in camelCase, `addressDetail: string \| null` |
| shared | `DomainEvent` | `type: string; occurredAt: Date` |
| transactions | `TransactionFinalizedEvent` | `DomainEvent & { type: 'transaction.finalized'; transactionId; status }` |

Insert inputs are derived types (`NewTransaction = Omit<Transaction, 'id' | 'status' | 'providerTransactionId' | … >`), declared next to each port.

### Frozen ports

Port conventions:

- **Repositories report facts; use cases decide errors.** A lookup returns `T | null` and the repository's error channel is `never`, because the same fact becomes a 404 or a 422 depending on the use case.
- Infrastructure failures (DB down, a bug) reject the promise and end as 500. They are not expected errors.
- `tx: TxContext` is required on writes and optional on reads.
- DI tokens are `Symbol`s named after the port in `UPPER_SNAKE_CASE`.

```ts
// shared/application/ports
interface TxContext { readonly __brand: 'TxContext' }
interface UnitOfWork { run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E> }   // commit on Ok, rollback on Err
interface Clock { now(): Date }
interface EventPublisher { publish(event: DomainEvent): ResultAsync<void, EventPublishError> }

// catalog
interface ProductRepository {
  findPage(page: { page: number; limit: number }): ResultAsync<{ items: Product[]; totalItems: number }, never>;
  findById(id: string, tx?: TxContext): ResultAsync<Product | null, never>;
}

// transactions (implemented by catalog, raw SQL)
type StockReservationOutcome = 'RESERVED' | 'INSUFFICIENT_STOCK';
interface StockReservationPort {
  reserve(tx: TxContext, line: StockLine): ResultAsync<StockReservationOutcome, never>;
  commit(tx: TxContext, line: StockLine): ResultAsync<void, never>;
  release(tx: TxContext, line: StockLine): ResultAsync<void, never>;
}   // StockLine { productId; quantity }

// locations
interface MunicipalityRepository {
  listDepartments(): ResultAsync<Department[], never>;
  listByDepartment(departmentCode: string): ResultAsync<Municipality[], never>;
  findByCode(code: string, tx?: TxContext): ResultAsync<Municipality | null, never>;
}
interface WarehouseRepository {
  listActive(): ResultAsync<Warehouse[], never>;
  findById(id: string): ResultAsync<Warehouse | null, never>;
}

// customers
interface CustomerRepository {
  findById(id: string): ResultAsync<Customer | null, never>;
  findByDocumentNumber(documentNumber: string, tx?: TxContext): ResultAsync<Customer | null, never>;
  findByEmail(email: string, tx?: TxContext): ResultAsync<Customer | null, never>;   // case-insensitive
  insert(tx: TxContext, customer: NewCustomer): ResultAsync<Customer, never>;
  updateContact(tx: TxContext, change: { id: string; fullName: string; phone: string }): ResultAsync<Customer, never>;
}

// transactions
interface TransactionRepository {
  findById(id: string, tx?: TxContext): ResultAsync<Transaction | null, never>;
  findByIdempotencyKey(key: string, tx?: TxContext): ResultAsync<Transaction | null, never>;
  insert(tx: TxContext, transaction: NewTransaction): ResultAsync<Transaction, never>;
  recordGatewayResponse(tx: TxContext, response: { id: string; providerTransactionId: string; statusMessage: string | null }): ResultAsync<void, never>;
  finalize(tx: TxContext, outcome: { id: string; status: FinalStatus; statusMessage: string | null }): ResultAsync<StockLine | null, never>;   // raw SQL; null = already finalized
  markEmailSent(tx: TxContext, id: string): ResultAsync<void, never>;
  claimPendingForSync(tx: TxContext, query: { olderThan: Date; limit: number }): ResultAsync<Transaction[], never>;       // FOR UPDATE SKIP LOCKED
  claimExpiredReservations(tx: TxContext, query: { now: Date; limit: number }): ResultAsync<Transaction[], never>;        // FOR UPDATE SKIP LOCKED
  findUnsentEmails(query: { finalizedBefore: Date; limit: number }): ResultAsync<Transaction[], never>;
}
interface PaymentGatewayPort {
  ensureAvailable(): Result<void, PaymentGatewayError>;   // circuit breaker, checked before reserving
  createCharge(request: CreateChargeRequest): ResultAsync<GatewayCharge, PaymentGatewayError>;
  getCharge(providerTransactionId: string): ResultAsync<GatewayCharge, PaymentGatewayError>;
  findChargeByReference(reference: string): ResultAsync<GatewayCharge | null, PaymentGatewayError>;
}
// CreateChargeRequest { reference; amountInCents; customerEmail; installments; cardToken; acceptanceToken; personalAuthToken }
// GatewayCharge { providerTransactionId; status: Exclude<TransactionStatus, 'EXPIRED'>; statusMessage: string | null; cardBrand: CardBrand | null; cardLast4: string | null }
// PaymentGatewayError { kind: 'UNAVAILABLE' | 'TIMEOUT' | 'REJECTED'; message: string }

// deliveries
interface DeliveryRepository {
  findById(id: string): ResultAsync<Delivery | null, never>;
  findByTransactionId(transactionId: string, tx?: TxContext): ResultAsync<Delivery | null, never>;
  insert(tx: TxContext, delivery: NewDelivery): ResultAsync<Delivery, never>;
  transition(tx: TxContext, change: { transactionId: string; to: 'READY_TO_SHIP' | 'CANCELLED' }): ResultAsync<void, never>;   // WHERE status = 'AWAITING_PAYMENT'
}

// notifications
interface EmailSender { send(message: { to: string; subject: string; html: string; text: string }): ResultAsync<void, EmailSendError> }
```

- Port locations follow `03-folder-structure.md`: `StockReservationPort` and `PaymentGatewayPort` live in `transactions`, `EmailSender` in `notifications`, and `UnitOfWork`, `Clock` and `EventPublisher` in `shared`.
- Each module's `index.ts` exports its domain types, port interfaces and tokens. `catalog` provides `STOCK_RESERVATION` through its module.
- Finalization is split across three repositories inside one `UnitOfWork`: `transactions.finalize` → `stock.commit` / `release` → `deliveries.transition`. Each one runs its own statement from §4.

### Persistence transformers

- `bigint` → `number`: throws on read or write when `!Number.isSafeInteger`.
- `numeric(9,6)` → `number`, because `pg` returns it as a string.

### Seed data files (`seeds/data/`)

```ts
// municipalities.json — generated by scripts/convert-divipola.ts, never edited by hand
{ code: string; name: string; departmentCode: string; departmentName: string;
  latitude: number; longitude: number; isMetroArea: boolean }[]

// warehouses.json
{ id: string; name: string; municipalityCode: string; address: string; latitude: number; longitude: number }[]

// products.json — image_url is derived as `/images/products/${sku}-640.webp`, not stored
{ sku: string; name: string; brand: string; description: string; priceInCents: number; stock: number }[]

// run-seed.ts
export interface SeedSummary { municipalities: number; warehouses: number; products: number }   // rows inserted
export function seedWithManager(manager: EntityManager): Promise<SeedSummary>;   // does the inserts, no transaction handling
export function runSeed(dataSource: DataSource): Promise<SeedSummary>;           // wraps seedWithManager in one transaction
```

Aburrá Valley metro-area codes (`isMetroArea: true`): `05001` Medellín, `05088` Bello, `05360` Itagüí, `05266` Envigado, `05631` Sabaneta, `05380` La Estrella, `05129` Caldas, `05212` Copacabana, `05308` Girardota, `05079` Barbosa.

### Warehouses

| id | name | municipality | address | lat, lng |
|---|---|---|---|---|
| `0b7c1f2e-5d4a-4e8b-9c1a-3f2d6e7a8b01` | Medellín DC | `05001` | Carrera 52 # 14-30, Guayabal | 6.2195, −75.5840 |
| `0b7c1f2e-5d4a-4e8b-9c1a-3f2d6e7a8b02` | Bogotá DC | `11001` | Carrera 106 # 15A-25, Zona Franca, Fontibón | 4.6706, −74.1473 |
| `0b7c1f2e-5d4a-4e8b-9c1a-3f2d6e7a8b03` | Cali DC | `76001` | Calle 15 # 8-56, Zona Industrial | 3.4580, −76.5220 |
| `0b7c1f2e-5d4a-4e8b-9c1a-3f2d6e7a8b04` | Barranquilla DC | `08001` | Vía 40 # 73-290, Zona Industrial Vía 40 | 11.0165, −74.7970 |

### Products (prices in COP with VAT included; stored ×100 as cents)

| SKU | Brand | Name | Price (COP) | Stock |
|---|---|---|---:|---:|
| `HP-SNY-WH1000XM5` | Sony | WH-1000XM5 | 1,899,900 | 7 |
| `HP-SNY-WF1000XM5` | Sony | WF-1000XM5 | 1,299,900 | 12 |
| `HP-SNY-WHCH720N` | Sony | WH-CH720N | 499,900 | 25 |
| `HP-BOS-QCULTRA` | Bose | QuietComfort Ultra Headphones | 2,199,900 | 3 |
| `HP-BOS-QCEARBUDS2` | Bose | QuietComfort Earbuds II | 1,099,900 | **0** |
| `HP-APL-AIRPODSPRO2` | Apple | AirPods Pro (2.ª generación) | 1,249,900 | 20 |
| `HP-APL-AIRPODSMAX` | Apple | AirPods Max | 2,999,900 | **1** |
| `HP-JBL-TUNE520BT` | JBL | Tune 520BT | 229,900 | 25 |
| `HP-JBL-LIVE770NC` | JBL | Live 770NC | 699,900 | 8 |
| `HP-JBL-TOURPRO2` | JBL | Tour Pro 2 | 1,049,900 | 5 |
| `HP-SNH-MOMENTUM4` | Sennheiser | Momentum 4 Wireless | 1,599,900 | 2 |
| `HP-SNH-HD660S2` | Sennheiser | HD 660S2 | 2,499,900 | 15 |
| `HP-BTS-STUDIOPRO` | Beats | Studio Pro | 1,399,900 | 8 |
| `HP-SMS-BUDS3PRO` | Samsung | Galaxy Buds3 Pro | 999,900 | 12 |
| `HP-ATH-M50X` | Audio-Technica | ATH-M50x | 749,900 | 5 |

- Descriptions: 2–3 sentences in Colombian Spanish (type, ANC yes or no, battery life, use case), written in the seed step and reviewed in its diff.
- Stock spread: 0, 1, 2, 3, 5, 7, 8, 12, 15, 20 and 25, so the demo covers "agotado", "última unidad", "pocas unidades" and normal stock.
- `HP-SNY-WH1000XM5` matches the example in `02-api-contracts.md` (1,899,900 and stock 7).

## Implementation plan

Prerequisites (not commits): `/spec-impl` creates and switches to `spec-02-api-app-foundation` (`AutoCreateBranch: true`). Run `docker compose up -d postgres` before Part 2. web 01 runs in parallel from a worktree (`pnpm worktree:new …`).

Each step is one commit after review. Target: ≤ ~300 changed lines per step, excluding the lockfile and the generated `municipalities.json`.

### Part 1 — Nest bootstrap

1. **Scaffold.** `apps/api/package.json` (Nest, `@nestjs/config`, `@nestjs/swagger`, `class-validator`, `class-transformer`, `neverthrow`, `helmet`, `webpack-node-externals`, Jest + `@swc/jest`), `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json` (webpack + Swagger plugin), `webpack.config.cjs` (allowlist `/^@checkout\//`), `jest.config.ts` (80% threshold, `json-summary` reporter, exclusions), a minimal `main.ts` and an empty `app.module.ts`. `main.ts` imports one constant from `@checkout/shared/constants` to prove resolution.
   Manual test: `pnpm --filter @checkout/api start:dev` boots; `build` then `node dist/main.js` boots too; `pnpm typecheck` passes.
   Commit: `chore(api): scaffold NestJS app with webpack build`.

2. **Boundary lint.** `apps/api/eslint.config.mjs` extends the root config and adds the 5 rules from `references/layering.md` (domain, application, cross-module `index.ts`, no network in persistence, `no-console`).
   Manual test: throwaway files that break each rule make `pnpm lint` fail with that rule; they are then deleted.
   Commit: `chore(api): enforce hexagonal boundaries with ESLint`.

3. **Config.** `environment-variables.ts`, `app-config.ts`, `app.constants.ts` and `config.module.ts`. Validation fails fast, listing every invalid variable. A test helper builds a valid config for unit tests.
   Manual test: removing `DB_HOST` from `.env` makes `start:dev` exit with a message that names it.
   Commit: `feat(api): validate environment config at startup`.

4. **Domain errors and Result helpers.** `DomainError`, `ErrorKind`, `result.ts`, `DomainErrorMapper` and the `code → title` table, with unit tests.
   Manual test: `pnpm --filter @checkout/api test` green.
   Commit: `feat(api): add DomainError, Result helpers and error mapper`.

5. **HTTP pipeline.** `configureApp(app)` (prefix, `ValidationPipe`, `helmet` with the relaxed CSP on docs, body limit), `ProblemDetailsFilter`, `DomainErrorException` and `respond()`. A unit spec mounts a test-only controller through `configureApp`, then checks 400 with `errors[]` for an unknown field, a mapped `DomainError`, and a 500 without a stack.
   Manual test: tests green; `main.ts` now calls `configureApp`.
   Commit: `feat(api): add HTTP pipeline and Problem Details filter`.

6. **Request id and logging.** `RequestIdMiddleware`, `nestjs-pino` with the redact paths, `pino-pretty` only in `development`, and the Nest logger replaced. Tests cover redaction at 0, 1 and 2 levels of nesting, id propagation and generation, and rejection of an id that breaks the pattern.
   Manual test: `curl -H 'X-Request-Id: abc' …` echoes `abc`, and the dev console shows a readable pretty line.
   Commit: `feat(api): add request id and redacted structured logging`.

7. **Resilience helpers.** `withTimeout`, `retryWithBackoff` and `CircuitBreaker`, with unit tests using an injected clock, random and sleep.
   Manual test: tests green.
   Commit: `feat(api): add timeout, retry and circuit breaker helpers`.

8. **Module shells, health and Swagger.** The 7 `<name>.module.ts` + empty `index.ts` files registered in `app.module.ts`, `GET /api/v1/health` → `{ data: { status: 'ok' } }`, and Swagger at `/api/docs`.
   Manual test: `start:dev`, then `/api/v1/health` returns 200 and `/api/docs` renders in the browser.
   Commit: `feat(api): register module shells, health endpoint and Swagger`.

### Part 2 — persistence and frozen ports

9. **DataSource and initial migration.** `data-source.ts` (reads `AppConfig`, `synchronize: false`), `TypeOrmModule` wiring, scripts `migration:run` / `migration:revert` / `migration:generate` through `tsx`, and `<ts>-initial-schema.ts` with §3 verbatim.
   Manual test: on an empty DB, `migration:run` then `\d+` in `psql` shows the 6 tables; `migration:revert` leaves it empty; `migration:run` again.
   Commit: `feat(api): add initial schema migration`.

10. **Transformers and ORM entities (reference data).** `transformers.ts` with unit tests, plus the `product`, `municipality`, `warehouse` and `customer` ORM entities with explicit column types.
    Manual test: `typecheck` and `test` green; the app boots with the entities registered.
    Commit: `feat(api): add money transformers and catalog, location and customer entities`.

11. **ORM entities (transactions and deliveries).** `transaction.orm-entity.ts` and `delivery.orm-entity.ts`.
    Manual test: `migration:generate` against the migrated DB produces an empty diff for the tables that TypeORM can express (it cannot express CHECKs or partial indexes). The generated file is deleted.
    Commit: `feat(api): add transaction and delivery entities`.

12. **Domain types and shared ports.** `domain-event.ts`, `unit-of-work.port.ts` (`TxContext`), `clock.port.ts` and `event-publisher.port.ts`; domain types and ports for `catalog`, `locations` and `customers`; tokens and `index.ts` exports.
    Manual test: `typecheck` and `lint` green.
    Commit: `feat(api): freeze shared, catalog, location and customer ports`.

13. **Remaining ports.** Domain types and ports for `transactions` (`TransactionRepository`, `StockReservationPort`, `PaymentGatewayPort`, `TransactionFinalizedEvent`), `deliveries` and `notifications`, plus `index.ts` exports.
    Manual test: `typecheck` and `lint` green; a cross-module deep import fails lint.
    Commit: `feat(api): freeze transaction, delivery and notification ports`.

14. **Unit of work and integration harness.** `TypeOrmTxContext`, `TypeOrmUnitOfWork`, `jest.int.config.ts` (`maxWorkers: 1`, a `globalSetup` that runs pending migrations) and the `test:int` script. `typeorm-unit-of-work.int-spec.ts` proves commit on `Ok`, rollback on `Err`, and rollback on a rejected promise.
    Manual test: `pnpm --filter @checkout/api test:int` green.
    Commit: `feat(api): add TypeORM unit of work and integration test harness`.

15. **CHECK constraint tests.** `initial-schema.int-spec.ts`: negative stock, `total ≠ subtotal + fees`, `subtotal ≠ price × qty`, quantity 11, invalid phone, and `finalized_at` inconsistent with status are all rejected. Also: a soft-deleted SKU does not block re-inserting it.
    Manual test: `test:int` green.
    Commit: `test(api): prove schema constraints against Postgres`.

16. **Health with database.** `SELECT 1` through the `DataSource`: 200 with `database: 'up'`, 503 with `database: 'down'`. Unit tests with a failing fake.
    Manual test: `docker compose stop postgres` → 503; `start` → 200.
    Commit: `feat(api): add database check to health endpoint`.

### Part 3 — seeds

17. **DIVIPOLA conversion.** `seeds/scripts/convert-divipola.ts` (fixed dataset URL, metro-area flag) and the generated `seeds/data/municipalities.json`. If the dataset lacks a required column, stop and report before continuing.
    Manual test: running the script twice produces an identical JSON; ~1,120 entries; 10 with `isMetroArea: true`.
    Commit: `feat(api): add DIVIPOLA municipalities dataset and converter`.

18. **Seed.** `warehouses.json` (addresses and coordinates checked on a map), `products.json` (Spanish descriptions), `run-seed.ts` (`seedWithManager` + `runSeed`, insert-only), `seed.cli.ts` and the `seed` script. `run-seed.int-spec.ts` runs `seedWithManager` twice inside a transaction that always rolls back: after the first run every seed key (DANE codes, warehouse ids, SKUs) is present, and the second run inserts 0 rows. It passes whether or not the local database was already seeded.
    Manual test: `migration:run && seed` prints the summary; running `seed` again prints zeros.
    Commit: `feat(api): seed municipalities, warehouses and products`.

19. **Seed reset.** `seed-reset.cli.ts` and the `seed:reset` script with both guards, plus unit tests for the guards.
    Manual test: change a product's price and stock with `psql`, run `seed:reset` → restored; with `NODE_ENV=production` → refuses.
    Commit: `feat(api): add local seed reset for demos`.

### Close-out

20. **PR and green CI.** Push, open the PR with `gh-cli`, wait for CI and fix whatever fails. If web 01 merged first, apply the lockfile protocol before pushing. Check in the `api-integration` log that `migration:run` and `test:int` actually ran (no `--if-present` no-op). Mark this spec `Implemented` and tick its criteria.
    Manual test: every check green; `coverage (api)` shows its table with ≥ 80%.
    Commit: `docs: mark spec 02 as Implemented`.

Notes:

- If CI fails in step 20, the fix goes in its own `fix: …` commit, after review.
- If any frozen `packages/shared` contract turns out to be wrong, stop and apply the contract-change protocol.
- If step 1 cannot make webpack compile `@checkout/shared`, stop and report before switching builders (see Risks).

## Acceptance criteria

Bootstrap

- [x] `pnpm --filter @checkout/api start:dev` serves `GET /api/v1/health` → 200 and renders Swagger UI at `/api/docs`.
- [x] `pnpm --filter @checkout/api build && node apps/api/dist/main.js` boots, and a value imported from `@checkout/shared` is present at runtime.
- [x] Starting with `DB_HOST` removed exits non-zero with a message naming `DB_HOST`. No `process.env` read exists outside `apps/api/src/config/`.
- [x] A request with an unknown body field returns 400 `application/problem+json` with `code: VALIDATION_ERROR` and an `errors[]` entry for that field.
- [x] A `DomainError` with kind `UNPROCESSABLE` is returned as 422 with its `code`, `detail` and `traceId`.
- [x] A thrown unknown error returns 500 `INTERNAL_ERROR` with no stack trace and no original message in the body.
- [x] Every response carries `X-Request-Id`: the incoming one when it matches the pattern, a new uuid v4 otherwise, and the same value appears as `traceId` and in the log line.
- [x] Responses include the `helmet` headers, and a body over `100kb` returns 413 Problem Details.
- [x] A log call containing `cardToken`, `acceptanceToken`, `personalAuthToken`, `documentNumber`, `email` or `phone` at nesting depth 0, 1 or 2, or an `authorization` header, prints `[REDACTED]`.
- [x] Logs are single-line JSON when `NODE_ENV` is `test` or `production`, and pretty-printed when it is `development`.
- [x] `withTimeout`, `retryWithBackoff` and `CircuitBreaker` have unit tests covering timeout and abort, retry count and delay bounds with jitter, and every closed / open / half-open transition.
- [x] `app.module.ts` imports the 7 module shells.

Boundaries

- [x] `pnpm lint` fails on a throwaway file for each case: a domain file importing `@nestjs/common` or `typeorm`; an application file importing from `infrastructure/`; a module importing another module's internals instead of its `index.ts`; a persistence file importing `undici`; a `console.log` in `src/`.

Persistence

- [x] On an empty database, `migration:run` creates the 6 tables and `migration:revert` leaves the database empty again; both exit 0.
- [x] The migration's SQL matches `01-data-model.md` §3: every CHECK constraint, the partial unique indexes and the partial reconciler indexes, and FKs without `ON DELETE`.
- [x] `synchronize` is `false` in every `DataSource` configuration.
- [x] An integration test proves the database rejects: negative stock, `total ≠ subtotal + fees`, `subtotal ≠ price × qty`, quantity 11, an invalid phone, and `finalized_at` inconsistent with `status`.
- [x] Reading a `bigint` above `Number.MAX_SAFE_INTEGER` through the transformer throws.
- [x] An integration test proves `TypeOrmUnitOfWork` commits on `Ok`, rolls back on `Err`, and rolls back on a rejected promise.
- [x] The 11 ports and their `Symbol` tokens exist with the signatures in the Data model section; no signature has more than 3 positional parameters.
- [x] `GET /api/v1/health` returns `{ data: { status: 'ok', database: 'up' } }` with the DB running, and 503 with `database: 'down'` when it is stopped.

Seeds

- [x] After `migration:run && seed` on an empty database: ~1,120 municipalities (10 with `is_metro_area = true`), 4 warehouses and 15 products.
- [x] Running `seed` a second time inserts 0 rows and changes no existing row.
- [x] At least one product has `stock_available = 0` and one has `1`; every `image_url` is `/images/products/<sku>-640.webp`.
- [x] After changing a product's price and stock by hand, `seed:reset` restores both. It refuses to run with `NODE_ENV=production` or while a `PENDING` transaction exists.
- [x] `runSeed` is exported from `run-seed.ts`, and `seed.cli.ts` only builds the `DataSource`, calls it and prints the summary.

Quality and CI

- [x] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @checkout/api test:cov` and `pnpm --filter @checkout/api test:int` exit 0 locally.
- [x] `apps/api` coverage is ≥ 80% on statements, branches, functions and lines, with only `main.ts`, migrations and seeds excluded.
- [x] The PR shows green `lint`, `typecheck`, `coverage (api)` and `api-integration`. The `api-integration` log shows `migration:run` applying the migration and `test:int` running the suites (not a `--if-present` no-op).
- [x] `git diff main --stat` shows no change under `packages/shared`, `apps/web`, `.github/`, `docs/`, `references/`, `phases/` or any `CLAUDE.md`.

## Decisions

Spec and branch

- **Yes:** one spec for the three parts, one PR. api 02 needs all three merged, and the phase rule is one file = one spec = one PR.
- **No:** three specs (bootstrap, persistence, seeds). Three review cycles for no parallelism gain.
- **Yes:** branch `spec-02-api-app-foundation`, created by `/spec-impl`. Same convention as SPEC 00 and 01.
- **No:** `feat/01-api-app-foundation` from the phase file.
- **Yes:** ≤ ~300 changed lines per step (20 steps), excluding the lockfile and the generated `municipalities.json`.

Build and tooling

- **Yes:** Nest CLI in webpack mode, with `webpack-node-externals` allowlisting `/^@checkout\//`. It compiles `@checkout/shared` from source into the bundle and keeps the Swagger CLI plugin working through ts-loader.
- **No:** SWC builder with tsconfig `paths`. Shared sits outside `rootDir` and would still need a runtime resolution trick.
- **No:** building `packages/shared` to JS. It breaks SPEC 01's "no build step" decision.
- **Yes:** `tsx` for the TypeORM CLI, the seed and the DIVIPOLA converter. Every column declares its type explicitly, because esbuild emits no decorator metadata.
- **No:** `ts-node` (slow, and trouble with ESM shared) or compiling to `dist/` before every `migration:run`.
- **Yes:** `@swc/jest` with decorator metadata, same as `packages/shared`. Type checking stays in `pnpm typecheck`.
- **Yes:** `apps/api/eslint.config.mjs` extends the root config. ESLint 10 resolves the nearest config file per linted file, so a standalone nested config would silently drop the root rules.

Bootstrap

- **Yes:** `class-validator` + `class-transformer` for environment validation. It is the same library as the DTOs, and `layering.md` keeps Zod out of the API.
- **No:** Joi (a second validation library) or Zod.
- **Yes:** every `.env.example` group is required and typed now. Feature phases never touch `config/` again, and integration tests only open a `DataSource`, so CI needs no gateway or SMTP values.
- **No:** adding the `paymentGateway` and `smtp` groups in api 04 / api 06.
- **Yes:** `nestjs-pino` with pino `redact`, plus `pino-pretty` only when `NODE_ENV=development`, as a dev dependency. CloudWatch needs JSON, and pretty output is for human eyes only.
- **No:** a custom `LoggerService` or winston.
- **Yes:** Swagger at `/api/docs` in every environment, so the reviewer can use it on the deployed URL. `helmet` keeps its default CSP everywhere except `/api/docs`, where it is relaxed for Swagger UI's inline scripts.
- **No:** Swagger only outside production, or `contentSecurityPolicy: false` for the whole API.
- **Yes:** `configureApp(app)` extracted from `main.ts`, so a unit test exercises the exact production pipeline with a test-only controller and no database.
- **Yes:** an incoming `X-Request-Id` is accepted only if it matches `^[A-Za-z0-9._-]{1,128}$`, otherwise it is regenerated. This prevents log injection through a header the client controls.
- **Yes:** body limit `100kb` as a named constant. The largest body (`POST /transactions`) is ~2 KB.

Errors

- **Yes:** `DomainError` carries both `code` and `kind`, and the mapper maps `kind` to HTTP. The same code needs different statuses in different use cases (`PRODUCT_NOT_FOUND`: 404 on a path, 422 in a body).
- **No:** mapping `code` to status. It cannot express the 404 / 422 split.
- **Yes:** framework `HttpException`s (unknown route, 413) keep their status and use `code: VALIDATION_ERROR`. The frozen `ErrorCode` has no generic code, and a contract change is not worth it for these cases.
- **Yes:** health's 503 body is `{ data: { status: 'ok', database: 'down' } }`, the shape the frozen `HealthStatus` allows. Part 1 returns `{ status: 'ok' }` typed as `Omit<HealthStatus, 'database'>` until Part 2 adds the check.
- **No:** Problem Details for the 503 health response, or moving health entirely to Part 2.

Persistence and ports

- **Yes:** one hand-written `InitialSchema` migration with §3 verbatim. TypeORM cannot generate partial indexes or compound CHECKs faithfully.
- **No:** one migration per table, or a generated migration edited by hand.
- **Yes:** `@UpdateDateColumn` for `updated_at`, with no DB trigger. §3 has none, and the raw SQL statements set `updated_at = now()` explicitly.
- **Yes:** decorator-free, data-only `readonly` domain types defined now, so frozen ports return domain types. Behavior (state machines, fee strategies) arrives later as pure functions over them.
- **No:** port-local `*Record` types. They duplicate every shape.
- **Yes:** repositories report facts (`T | null`, `'INSUFFICIENT_STOCK'`, `StockLine | null`) with a `never` error channel; use cases decide the domain error. Infrastructure failures reject and end as 500.
- **Yes:** opaque `TxContext` + `TypeOrmTxContext` narrowed with `instanceof`, with `tx` required on writes and optional on reads. Explicit, no casts, no extra dependency, and forgetting `tx` on a write does not compile.
- **No:** a generic `UnitOfWork<Tx>` (the generic leaks into every port and DI token), `AsyncLocalStorage` (implicit, hides what runs inside a transaction), or a cast.
- **Yes:** `UnitOfWork` rolls back on `Err`, not only on a throw. With ROP, expected failures are returned, and TypeORM's `transaction()` would otherwise commit them.
- **Yes:** finalization split into `transactions.finalize` → `stock.commit` / `release` → `deliveries.transition` inside one unit of work. Each repository owns its own §4 statement.
- **Yes:** `PaymentGatewayPort.findChargeByReference`, because the spike confirmed lookup by reference, needed to resolve ambiguous POST timeouts.
- **Yes:** integration tests use the docker-compose `checkout` database, a `globalSetup` applies pending migrations, and data is never cleaned up (uniqueness via `randomUUID()`), as in `testing.md`.
- **No:** a separate `checkout_test` database.

Seeds

- **Yes:** the converter downloads the geolocated DIVIPOLA CSV from a fixed URL; only the script and the JSON are committed.
- **No:** committing the raw CSV.
- **Yes:** the non-municipalized areas are included. They are real shipping destinations and have DANE codes.
- **Yes:** fixed UUIDs for warehouses and `ON CONFLICT (id) DO NOTHING`. Idempotent without changing §3, which has no unique index on `warehouses.name`.
- **No:** select-then-insert by name, or adding a unique index on `name`.
- **Yes:** `seed` is insert-only (`ON CONFLICT DO NOTHING`), safe for the migrator Lambda even if infra runs it on every deploy.
- **Yes:** a separate local-only `seed:reset` that restores price and `stock_available` of the 15 products. It refuses to run under `NODE_ENV=production` or while any `PENDING` transaction exists, and never touches `stock_reserved`. Resetting during a pending purchase would push `stock_reserved` negative at finalization, and the CHECK would leave the purchase stuck in PENDING.
- **No:** `ON CONFLICT DO UPDATE` in `seed`. A deploy during review would silently undo the reviewer's purchases.
- **Yes:** no environment guard on `seed`. It is idempotent and insert-only, and FR-26 needs the data in AWS. The "(local only)" note in the root `CLAUDE.md` becomes outdated, but that file is out of scope.
- **Yes:** `image_url` derived from the SKU in the seed, not stored in `products.json`.
- **Yes:** the seed integration test runs `seedWithManager` twice inside a transaction that always rolls back. It works whether or not the local database was already seeded, and leaves no data.

## Risks

| Risk | Mitigation |
| --- | --- |
| ts-loader in Nest's webpack mode refuses or mis-compiles files from `packages/shared` (outside the api project), and the build fails. | Step 1 proves it before anything else. First fix: add `../../packages/shared/src` to the api `tsconfig.json` `include`. If that is not enough, stop and report before trying another builder. |
| `pino-pretty` runs as a pino transport in a worker thread, resolved by module name; bundling it with webpack breaks it. | Only `@checkout/*` is allowlisted, so `pino` and `pino-pretty` stay external `node_modules` requires. Pretty mode is never enabled in the deployed bundle. |
| Globs for `entities` and `migrations` do not work inside a webpack bundle. | The Nest app registers entity classes explicitly and runs no migrations. Only the CLI `data-source.ts` (through `tsx`) uses the migrations glob. |
| ESLint 10 uses the nearest config file, so `apps/api/eslint.config.mjs` could silently drop the root rules (`max-params`, `no-console`, `process.env`). | The api config imports and spreads the root config. Step 2's throwaway files check root and boundary rules together. |
| `tsx` (esbuild) emits no decorator metadata, so an entity column without an explicit type fails at CLI time but not in the webpack app. | Every `@Column` declares `type`. Step 9 runs the CLI against the entities from day one. |
| The DIVIPOLA dataset URL, column names or coordinate format differ from what is expected, or coordinates are missing. | Step 17 stops and reports before writing the JSON. The converter validates every row (5-digit code, lat/lng in range) and fails on the first bad one. |
| A frozen port signature turns out to be wrong once a feature phase uses it. | Contract-change protocol from `PARALLELIZATION.md`: stop, minimal PR against `main`, rebase the active sessions. |
| Integration tests share the local dev database, so committed test rows (e.g. from the unit-of-work test) could show up in the local catalog. | Rows that commit use `customers` (never listed publicly) with random document numbers. CHECK tests fail by design and persist nothing, and the seed test always rolls back. `docker compose down -v` resets the local DB if needed. |
| Warehouse addresses and coordinates are approximate. | Checked on a map in step 18 before the commit. Zone-level precision is enough for Haversine and the fee rules. |
| `web 01` merges first and `pnpm-lock.yaml` conflicts. | Lockfile protocol: `git checkout main -- pnpm-lock.yaml && pnpm install`, rerun checks, push. Never merge the lockfile by hand. |
| The first CI run fails for a reason not reproducible locally (Postgres service timing, cache). | Fixed in step 20 in its own `fix:` commit, after review. |

## What is **not** in this spec

- Repository implementations, use cases, DTOs and business endpoints (api 02 onwards).
- `lambda.ts`, the email worker, the reconciler handler and the migrator Lambda (infra 05 / infra 09).
- Product image files (web 02) and their upload to S3.
- Rate limiting, the throttler and the Postman collection (api 07).
- Event publisher, gateway and email adapters (api 04.2, api 04.1, api 06).
- HTTP e2e tests against the full `AppModule` in `apps/api/test`.
- Any change to `packages/shared`, `apps/web`, `.github/workflows/ci.yml`, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.

Each of these, if it lands, goes in its own spec.
