# Design 03 — Folder Structure

## 1. Monorepo (pnpm workspaces, Node 22 LTS)

```
headphones-checkout/
├─ apps/
│  ├─ api/                 NestJS: API (Lambda + local server), email worker, reconciler
│  ├─ web/                 React + Vite SPA
│  └─ e2e/                 Playwright
├─ packages/
│  └─ shared/              Zod schemas, constants, enums, API contract types
├─ infra/                  AWS CDK (TypeScript)
├─ docs/
│  ├─ design/              01-data-model.md, data-model.dbml, 02-api-contracts.md, 03-folder-structure.md, …
│  ├─ evidence/<feature>/  Chrome and Playwright screenshots
│  └─ postman/             Postman collection
├─ references/             coding-conventions.md, layering.md, data-integrity.md, testing.md
├─ requirements/           general-requirements.md
├─ .github/workflows/      ci.yml (lint + typecheck + coverage + integration + mocked e2e)
├─ CLAUDE.md               Project conventions (apps/api and apps/web have their own)
├─ docker-compose.yml      Local Postgres 16
├─ pnpm-workspace.yaml · package.json · tsconfig.base.json · eslint.config.js · .prettierrc · .nvmrc · .env.example
└─ README.md
```

Package names use a generic scope: `@checkout/api`, `@checkout/web`,
`@checkout/shared`, `@checkout/infra`, `@checkout/e2e`. The storefront is
branded "SoundHub".

## 2. API — hexagonal, per module

Dependency rule: `infrastructure → application → domain`. The domain knows
nothing about Nest, TypeORM or HTTP. Modules only use what another module
exports from its `index.ts`. See `references/layering.md`.

```
apps/api/
├─ CLAUDE.md
├─ src/
│  ├─ main.ts                          Local bootstrap
│  ├─ lambda.ts                        API Gateway handler (app cached across invocations)
│  ├─ workers/
│  │  ├─ email-worker.handler.ts       SQS consumer (application context, no HTTP)
│  │  └─ reconciler.handler.ts         EventBridge Scheduler target
│  ├─ app.module.ts
│  ├─ config/                          Env validation at startup (fail fast)
│  ├─ shared/
│  │  ├─ domain/                       DomainError, Money, Result helpers
│  │  ├─ application/ports/            UnitOfWork, Clock, EventPublisher, IdGenerator
│  │  └─ infrastructure/
│  │     ├─ http/                      ProblemDetailsFilter, DomainErrorMapper, RequestIdMiddleware
│  │     ├─ persistence/               DataSource, TypeOrmUnitOfWork, migrations/, seeds/
│  │     ├─ messaging/                 SqsEventPublisher, InMemoryEventPublisher
│  │     ├─ resilience/                withTimeout, retryWithBackoff (jitter), CircuitBreaker
│  │     └─ logging/                   JSON logger with requestId and redaction
│  └─ modules/
│     ├─ catalog/                      Products and stock
│     ├─ locations/                    Departments, municipalities, warehouses, nearest warehouse
│     ├─ pricing/                      Quote: base fee + delivery fee strategies
│     ├─ customers/                    Upsert by national ID
│     ├─ transactions/                 Checkout, gateway, finalization, reconciler, webhook
│     ├─ deliveries/                   Delivery queries
│     └─ notifications/                Result email (EmailSender port)
└─ test/                               HTTP e2e (supertest)
```

### Module anatomy — `transactions`

```
modules/transactions/
├─ index.ts                                  Public API of the module
├─ domain/
│  ├─ transaction.ts                         Aggregate + state machine
│  ├─ transaction-status.ts
│  ├─ transaction-reference.ts               TX-YYYYMMDD-XXXXXX
│  ├─ transaction.errors.ts
│  └─ transaction-finalized.event.ts
├─ application/
│  ├─ ports/
│  │  ├─ transaction.repository.port.ts
│  │  ├─ payment-gateway.port.ts             createCharge(), getCharge() → ResultAsync
│  │  └─ stock-reservation.port.ts           reserve / commit / release (implemented by catalog)
│  └─ use-cases/
│     ├─ create-transaction.use-case.ts      Split by phase: quote → reserve → charge
│     ├─ get-transaction-status.use-case.ts  Syncs while PENDING
│     ├─ finalize-transaction.use-case.ts    Idempotent; shared by polling, webhook and reconciler
│     ├─ reconcile-transactions.use-case.ts
│     └─ handle-payment-webhook.use-case.ts
├─ infrastructure/
│  ├─ http/
│  │  ├─ transactions.controller.ts
│  │  ├─ payment-webhook.controller.ts
│  │  └─ dto/
│  ├─ persistence/
│  │  ├─ transaction.orm-entity.ts
│  │  ├─ transaction.mapper.ts
│  │  └─ typeorm-transaction.repository.ts   Raw SQL for finalization and reconciler selection
│  └─ payment-gateway/
│     ├─ http-payment-gateway.adapter.ts     Timeout + retry (GET only) + circuit breaker
│     ├─ integrity-signature.ts
│     ├─ event-checksum.ts
│     └─ gateway-status.mapper.ts            Anti-corruption layer
└─ transactions.module.ts
```

Every module follows the same shape. Notable contents:
- `pricing/domain/`: `base-fee.policy.ts` and `delivery-fee/` with the
  `DeliveryFeeStrategy` interface, `free-metro.strategy.ts`,
  `metro-flat.strategy.ts`, `national-distance.strategy.ts` and `delivery-fee.resolver.ts`.
- `locations/domain/`: `haversine.ts` and `nearest-warehouse.finder.ts`.
- `catalog/infrastructure/persistence/`: the stock repository with the raw reservation SQL.
- `notifications/infrastructure/`: `nodemailer-gmail.adapter.ts` and per-status templates.

### UnitOfWork + ROP

```ts
export interface UnitOfWork {
  /** Commits when `work` resolves to Ok, rolls back when it resolves to Err. */
  run<T, E>(work: (tx: TxContext) => ResultAsync<T, E>): ResultAsync<T, E>;
}
```

`TypeOrmUnitOfWork` wraps `dataSource.transaction()` and hands the
`EntityManager` to the repositories through `TxContext`.

## 3. Web — by feature

```
apps/web/
├─ CLAUDE.md
├─ DESIGN.md
└─ src/
   ├─ main.tsx
   ├─ app/                    store.ts (redux-persist), hooks.ts, router.tsx, providers.tsx
   ├─ config/env.ts           Only reader of import.meta.env
   ├─ services/
   │  ├─ api.ts               RTK Query createApi (baseUrl /api/v1, X-Request-Id)
   │  └─ payment-gateway.ts   getAcceptanceTokens(), tokenizeCard()
   ├─ components/
   │  ├─ ui/                  shadcn primitives
   │  └─ layout/              header.tsx, page-container.tsx
   ├─ features/
   │  ├─ catalog/             catalog.api.ts · pages/ · components/ (product-card, product-grid, pagination, quantity-selector, stock-badge)
   │  ├─ checkout/            checkout.slice.ts · checkout.api.ts · components/ (checkout-dialog, card-form, delivery-form, legal-acceptance, summary-sheet, card-brand-icon) · hooks/ · lib/ (luhn, card-brand, masks)
   │  ├─ transaction/         transaction.api.ts · pages/transaction-status-page.tsx · hooks/use-transaction-polling.ts
   │  └─ customer/            customer.slice.ts (remember / forget)
   ├─ lib/                    money.ts (formatCop), cn.ts
   ├─ styles/index.css        Tailwind v4 + @theme tokens
   └─ test/                   setup.ts, render-with-providers.tsx, fixtures/
```

- Routes: `/` (catalog), `/products/:id` (product; the checkout dialog for
  steps 2–3 opens here), `/transactions/:id` (final status). The final
  status has its own URL so a refresh or a shared link always shows the
  real payment state.

## 4. Shared

```
packages/shared/src/
├─ constants/      limits.ts (MAX_QUANTITY, INSTALLMENTS, RESERVATION_TTL_MS), patterns.ts (phone, national ID, DANE code)
├─ enums/          transaction-status.ts, delivery-status.ts, fee-rule.ts, error-codes.ts
├─ contracts/      API request/response types and ProblemDetails
└─ validation/     Zod schemas (card, delivery, customer) — used by the web app only
```

Consumed by subpath exports (`@checkout/shared/constants`, `/enums`,
`/contracts`, `/validation`) straight from TypeScript source: Vite, esbuild
and Jest compile it, so there is no separate build step.

## 5. Infra (CDK)

```
infra/
├─ bin/app.ts
├─ lib/
│  ├─ data-stack.ts          RDS Postgres + Secrets Manager
│  ├─ backend-stack.ts       API Lambda + HTTP API, SQS (+ DLQ) + email worker, Scheduler + reconciler
│  └─ frontend-stack.ts      S3 (SPA + images) + CloudFront (/api/* → HTTP API, response headers policy)
└─ cdk.json
```
