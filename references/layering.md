# Layering and boundaries

Referenced from `CLAUDE.md`. Read when adding a module, feature or
cross-layer dependency. A new architectural boundary gets an ESLint rule,
not a comment asking people to remember it.

## API — hexagonal, per module

```
infrastructure  →  application  →  domain
(http, persistence,   (use cases,      (entities, value objects,
 gateway, messaging)   ports)           state machines, errors)
```

- `domain/` is pure TypeScript. It may import `neverthrow` and
  `@checkout/shared/{enums,constants}`, nothing else: no `@nestjs/*`, no
  `typeorm`, no `infrastructure`.
- `application/` defines ports (interfaces + DI tokens) and use cases. It
  imports `domain/` and its own ports, never an adapter.
- `infrastructure/` implements ports (TypeORM repositories, HTTP gateway
  adapter, SQS publisher, Nodemailer sender) and exposes controllers. DTOs
  live only in `infrastructure/http/dto` and are mapped to commands before
  reaching a use case.
- Modules talk to each other only through what another module exports in
  its `index.ts` (application services or ports). Example: `transactions`
  depends on `StockReservationPort`, which `catalog` implements.

### Lint rules (in `apps/api/eslint.config.mjs`)

| Files | Forbidden imports | Why |
|---|---|---|
| `src/**/domain/**` | `@nestjs/*`, `typeorm`, `**/infrastructure/**`, `**/application/**` | The domain stays framework-free |
| `src/**/application/**` | `**/infrastructure/**`, `typeorm` | Use cases depend on ports, not adapters |
| `src/modules/<a>/**` | `src/modules/<b>/*/**` (anything but `<b>/index.ts`) | Modules are coupled only through their public API |
| `src/**/infrastructure/persistence/**` | `undici`, `node:http`, `node:https`, `axios`, any `*payment-gateway*` | No network call while a DB transaction holds row locks |
| `src/**` (except tests and scripts) | `console` (`no-console`) | Redaction must be a guarantee |

### No network inside a database transaction

The payment gateway is called **after** the `UnitOfWork` that reserves the
stock has committed. A slow gateway must never keep row locks open. The
same applies to finalization: fetch the gateway status first, then open the
transaction that applies it.

### The domain-service test

Before writing a domain check, ask: *does the database already guarantee
this?* If a `CHECK`, `UNIQUE` or conditional `UPDATE` already enforces a
rule (stock ≥ 0, one delivery per transaction, no double finalization), do
not duplicate it in a domain class — that creates a second, divergent
source of truth. The domain owns what the database cannot express: the
transaction and delivery state machines, the fee strategies, the base-fee
policy, the Haversine distance and the integrity signature.

## Web — by feature

```
app/  →  features/  →  components/ui/
 │          │              (shadcn primitives, no business logic)
 │          └──→  services/ (RTK Query base API, gateway client)
 └──→ config/env.ts (only reader of import.meta.env)
```

| Rule | Detail |
|---|---|
| W1 | `components/ui/` never imports from `features/`, `services/` or `app/`. |
| W2 | A feature imports another feature only through its `index.ts`. |
| W3 | Server state lives in RTK Query; client state (checkout step, remembered customer, idempotency key) lives in slices. Server data is never copied into a slice. |
| W4 | No `useEffect` to fetch data — RTK Query hooks own fetching, caching and polling. |
| W5 | Card number and CVC live only in the card form's local state; they never enter Redux, storage or logs. |
| W6 | Only the `checkout` and `customer` slices are persisted (redux-persist whitelist). |
| W7 | Everything visual follows `apps/web/DESIGN.md`. |

W1, W2 and the `import.meta.env` restriction are enforced with
`no-restricted-imports` / `no-restricted-syntax` in `apps/web/eslint.config.js`.

## Shared package

`packages/shared` has no runtime dependencies other than `zod` (used only by
`/validation`). It is consumed by subpath (`@checkout/shared/constants`,
`/enums`, `/contracts`, `/validation`) so the API never bundles Zod.
