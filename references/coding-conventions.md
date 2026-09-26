# Coding conventions

Referenced from `CLAUDE.md`. These rules apply identically to `apps/api`,
`apps/web` and `packages/shared`. Read before writing or refactoring a use
case, service, component or any function whose signature is growing.

| # | Rule | Enforced by |
|---|---|---|
| C1 | Max 3 positional parameters | ESLint `max-params` |
| C2 | Named constants over env vars; env read only in `config/` | ESLint `no-restricted-syntax` |
| C3 | Use cases hold their own logic; mechanical parts go to `helpers/` | Review |
| C4 | Comments say *why*, never *what* | Review |
| C5 | Strict TypeScript, no `any` | ESLint (`recommendedTypeChecked`) |
| C6 | Money is integer cents | Review + `Cents` type |
| C7 | kebab-case file names with a role suffix | ESLint `unicorn/filename-case` |
| C8 | Modules and features are imported only through their `index.ts` | ESLint `no-restricted-imports` |
| C9 | Expected errors are `Result`s, never thrown | Review + `no-empty` |
| C10 | No `console.*` | ESLint `no-console` |
| C11 | Raw SQL only for the three concurrency-critical statements | Review |

## C1 — Max 3 positional parameters

A function or method takes at most 3 positional arguments. Beyond that,
bundle the rest into a single parameter object with a named `interface`.
Context objects (`tx`, `manager`) count toward the 3.

```ts
// No — call sites are unreadable without opening the signature
function buildDelivery(tx: TxContext, transactionId: string, warehouseId: string, distanceKm: number, rule: FeeRule) { … }

// Yes — the interface stays local to the file while nothing else uses it
interface BuildDeliveryParams {
  transactionId: string;
  warehouseId: string;
  distanceKm: number;
  rule: FeeRule;
}
function buildDelivery(tx: TxContext, params: BuildDeliveryParams) { … }
```

If a second file needs the same shape, promote it to the module's
`*.types.ts` instead of duplicating it. React components already follow
this rule: they receive a single typed props object.

```tsx
interface SummarySheetProps { quote: Quote; card: CardSummary; onPay: () => void; }
export function SummarySheet({ quote, card, onPay }: SummarySheetProps) { … }
```

## C2 — Named constants over environment variables

A value nobody tunes per deployment (reservation TTL, max quantity, polling
interval, gateway timeout) is a named constant: in `packages/shared/src/constants`
when both apps need it, otherwise in the module's `*.constants.ts`.
Environment variables are only for values that change per environment
(URLs, keys, secrets, database connection).

`process.env` (api) and `import.meta.env` (web) are read in exactly one
place per app — `config/` — and validated at startup so a misconfiguration
fails fast. Everything else imports the typed config.

## C3 — Use cases hold their own logic; only the mechanical parts become helpers

A use case's flow — its conditionals and the sequence of steps that make it
*that* operation — stays written in its own method body. Do not collapse a
method into a single call to an external function that does everything.

Only pull a piece out when it is **purely mechanical and makes no decision
of its own**: running one SQL statement, computing a signature, mapping a
row. Those live as exported functions in a `helpers/` folder next to the
use case, not as `private` methods. Some duplication between sibling
methods is accepted; it is not a reason to extract a do-everything function.

**Exception — multi-phase orchestrators.** A use case that runs distinct,
named phases (e.g. `CreateTransactionUseCase`: quote → reserve → charge)
may split by phase into `private` methods, so `execute()` reads as a table
of contents. Each phase keeps its own decisions inside its own method.

```ts
execute(cmd: CreateTransactionCommand): ResultAsync<TransactionView, CheckoutError> {
  return this.checkIdempotency(cmd)
    .andThen(() => this.quoteAndVerify(cmd))
    .andThen((quote) => this.reserve(cmd, quote))
    .andThen((pending) => this.charge(pending, cmd.payment));
}
```

The same applies to React: a component renders; decisions and effects live
in hooks (`useCheckoutFlow`, `useTransactionPolling`); pure calculations
(`luhn`, `detectCardBrand`) live in `lib/`.

## C4 — Comments

A comment says what the code cannot: a short *why* (2–3 lines max), an
invariant, or a safety warning (lock or transaction rules, redaction
guarantees).

- No requirement, phase or step IDs (`FR-13`, "step 4").
- No narration of what the next lines visibly do, no history.
- At most one pointer per comment, in the form `See docs/design/<doc>.md#<anchor>`.
- A one-line doc comment on a port or exported symbol is fine when it helps.

## C5 — Strict TypeScript

`strict: true`, `noUncheckedIndexedAccess: true`. ESLint with
`recommendedTypeChecked`, and these as errors: `no-explicit-any`,
`no-floating-promises`, `no-misused-promises`, `no-unnecessary-type-assertion`.
Prefer `unknown` + narrowing over casts. Use `satisfies` for literal configs.

## C6 — Money

- Stored, transported and computed as integer cents (`bigint` in the
  database, `number` in TypeScript, always an integer). Field names end in
  `InCents`.
- Never `parseFloat`, never decimals, never money arithmetic in the web app.
- Formatting happens only at the UI edge with `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`.

## C7 — Naming

| Kind | File | Symbol |
|---|---|---|
| Use case | `create-transaction.use-case.ts` | `CreateTransactionUseCase` |
| Port | `payment-gateway.port.ts` | `PaymentGatewayPort` + DI token `PAYMENT_GATEWAY` |
| Adapter | `http-payment-gateway.adapter.ts` | `HttpPaymentGatewayAdapter` |
| ORM entity / mapper / repository | `transaction.orm-entity.ts`, `transaction.mapper.ts`, `typeorm-transaction.repository.ts` | |
| Domain errors | `transaction.errors.ts` | `outOfStock()`, `priceChanged()` factories |
| DTO | `create-transaction.dto.ts` | `CreateTransactionDto` |
| Redux | `checkout.slice.ts`, `checkout.api.ts`, `checkout.selectors.ts` | `checkoutSlice`, `selectCheckoutStep` |
| React component | `summary-sheet.tsx` | `SummarySheet` |
| Hook | `use-transaction-polling.ts` | `useTransactionPolling` |
| Tests | `*.spec.ts` (api, shared) · `*.int-spec.ts` (api integration) · `*.test.tsx` (web) | |

## C8 — Public API per module and feature

Each API module (`modules/<name>`) and web feature (`features/<name>`)
exposes what others may use through its `index.ts`. Importing another
module's or feature's internals (`modules/catalog/infrastructure/...`) is a
lint error.

## C9 — Errors

- Expected failures (out of stock, price changed, gateway declined) are
  returned as `Result` / `ResultAsync` (neverthrow). Domain and application
  code never `throw` for them.
- `throw` is reserved for framework edges and truly unexpected failures.
- Each module defines its errors as a discriminated union with a `code`
  from `@checkout/shared/enums` (`ErrorCode`). A single `DomainErrorMapper`
  translates them to HTTP.
- Web: API errors are typed as `ProblemDetails`; the UI switches on `code`,
  never on message text. No empty `catch`.

## C10 — Logging

No `console.*` in application code. The API uses the structured logger
(with redaction of card, token, document number, email and phone fields).
The web app does not log in production.

## C11 — Raw SQL scope

Parameterized raw SQL (`$1`, `$2`, never string concatenation) is used
**only** for:

1. Stock reservation (`UPDATE … WHERE stock_available >= $2 RETURNING`).
2. Transaction finalization (conditional `UPDATE … WHERE status = 'PENDING' RETURNING`
   plus the stock commit/release and the delivery transition).
3. The reconciler's selection of work (`SELECT … FOR UPDATE SKIP LOCKED`).

In those statements the SQL itself is the guarantee, so it must read
exactly as written in `docs/design/01-data-model.md`. Everything else uses
TypeORM repositories. Raw SQL lives only in `infrastructure/persistence`,
its result is typed by annotating the variable (`const rows: ReservedRow[] = …`,
never an `as` cast), and every raw statement has an integration test
against a real Postgres.
