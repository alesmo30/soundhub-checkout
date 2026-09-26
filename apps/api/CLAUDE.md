# apps/api — CLAUDE.md

Loads automatically when working inside `apps/api`. Root `CLAUDE.md` still applies.

- Before touching boundaries or adding a module: `references/layering.md`.
- Before touching money, stock, transaction states or idempotency: `references/data-integrity.md`.
- Contracts to honor: `docs/design/02-api-contracts.md`. Schema: `docs/design/01-data-model.md`.

## Where things live
- Entry points: `src/main.ts` (local server), `src/lambda.ts` (API Gateway),
  `src/workers/email-worker.handler.ts` (SQS), `src/workers/reconciler.handler.ts` (EventBridge).
- Modules: `catalog`, `locations`, `pricing`, `customers`, `transactions`,
  `deliveries`, `notifications`, each with `domain/`, `application/{ports,use-cases}`,
  `infrastructure/{http,persistence,…}` and an `index.ts`.
- Cross-cutting: `src/shared/` (DomainError, Money, UnitOfWork, EventPublisher,
  ProblemDetails filter, resilience helpers, logger).
- Raw SQL lives only in the three repositories listed in
  `references/coding-conventions.md#c11--raw-sql-scope`.

## Rules worth repeating here
- Use cases return `ResultAsync`; only `DomainErrorMapper` turns errors into HTTP.
- The gateway is called after the reservation transaction commits, never inside it.
- Global `ValidationPipe`: `whitelist`, `forbidNonWhitelisted`, `transform`.
  Nested DTOs need `@ValidateNested()` + `@Type()`.
- TypeORM `synchronize` is always off; schema changes are migrations.
- In Lambda, the Nest app and the `DataSource` are created once per container
  and reused across invocations (small pool).
