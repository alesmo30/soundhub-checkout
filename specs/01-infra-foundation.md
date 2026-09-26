# SPEC 01 — Infra: monorepo foundation and frozen shared contracts

> **Status:** Implemented
> **Depends on:** — (blocking: api 01 and web 01 start only after this spec merges; SPEC 00 ran in parallel)
> **Date:** 2026-09-26
> **Objective:** Turn the repository into a pnpm monorepo whose lint, typecheck, per-workspace coverage and CI enforce the coding standards, and freeze in `packages/shared` every constant, enum, contract and form schema that api 01 and web 01 need to work in parallel.

## Scope

**In:**

Part 1 — monorepo tooling

- Root `package.json` (private, `"type": "module"`, `packageManager: "pnpm@10.34.5"`, `engines.node: ">=22 <23"`) with scripts `lint`, `format`, `typecheck`, `test`, `test:cov`, `verify` and `worktree:new`. The workspace scripts fan out with `pnpm -r --if-present`.
- `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `infra`) and `.nvmrc` (`22`).
- `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false`, `moduleResolution: bundler`). A root `tsconfig.json` covers `scripts/**` and root config files, so lint and typecheck reach them.
- `eslint.config.js` (flat, `recommendedTypeChecked`) with every rule in R3. `no-console` is off for `scripts/**`. `eslint-config-prettier` removes the rules that clash with Prettier.
- `.prettierrc` (`singleQuote`, `trailingComma: all`, `printWidth: 100`) and `.prettierignore`: all `*.md`, `pnpm-lock.yaml`, `coverage/`, `dist/`, `cdk.out/`, `.github/workflows/claude*.yml`.
- `.editorconfig`. The existing `.gitignore` is extended (R7) and keeps its current entries.
- `.env.example` with the agreed list: `DB_*`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, `PAYMENT_GATEWAY_*` (5), `SMTP_*` + `EMAIL_FROM`, `VITE_*` (4). Placeholder values only.
- `docker-compose.yml`: Postgres 16, `name: headphones-checkout`, named volume, healthcheck, port 5432. `POSTGRES_*` values come from the `DB_*` variables in `.env`.
- `.github/workflows/ci.yml` on `pull_request` and `push` to `main`, with jobs `lint`, `typecheck`, `coverage` (matrix `shared` / `api` / `web`, each running `test:cov --if-present` and writing a percentage table to the job summary), `api-integration` (Postgres 16 service, `migration:run` and `test:int -- --passWithNoTests`, both `--if-present`) and `e2e` (`if: false`).
- Workspace shells `apps/api`, `apps/web`, `apps/e2e` and `infra`: a minimal `package.json` each (`@checkout/<name>`, private, no scripts).
- `scripts/worktree-new.sh`: creates `../hc-<branch>` from `main` (or checks out an existing branch), symlinks `.env` and runs `pnpm install`.
- `pnpm lint` passes on the existing `scripts/gateway-spike.ts`, and SPEC 00's pending criterion is ticked.

Part 2 — `packages/shared` (frozen)

- `package.json` with subpath exports straight to TypeScript source (`./constants`, `./enums`, `./contracts`, `./validation`). `zod` is its only runtime dependency, imported only by `/validation`.
- `constants/`: `limits.ts` (the R2 values) and `patterns.ts` (phone, national ID, DANE municipality code, department code).
- `enums/`: `TransactionStatus`, `DeliveryStatus`, `FeeRule`, `CardBrand` (`VISA`, `MASTERCARD`) and `ErrorCode` (every code in `02-api-contracts.md`), as `as const` objects plus a union type of the same name.
- `contracts/`: request and response types for every endpoint in `02-api-contracts.md`, with the same field names and shapes.
- `validation/`: `customerSchema`, `deliverySchema` and `cardSchema` with the agreed rules and Spanish messages, plus the `detectCardBrand`, `isValidLuhn` and expiry helpers.
- Jest with `@swc/jest`, a 90% threshold on all four metrics, and `json-summary` output for the CI table.

**Out of scope (for future specs):**

- NestJS, Vite, React, Playwright and CDK code or configuration (api 01, web 01, web 08, infra 05).
- Per-app ESLint boundary rules and per-app Jest configs with the 80% threshold (api 01, web 01).
- Server-side DTOs, fee calculations and money formatting.
- How the card form shows errors, the brand logo and the unsupported-brand state on screen (web 03).
- Enabling the `e2e` job (web 08).
- AWS-only variables: SQS URL, region, secret ARNs (infra 05).
- Migrations, seed and the `migration:run` / `test:int` scripts (api 01).
- GitHub branch protection and required checks (a manual repository setting).
- Posting coverage as a PR comment, and separate workflow files per app.
- Any change to `docs/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

## Data model

This spec creates no database tables. It freezes the structures in `packages/shared` and the environment configuration. Field names and shapes come from `docs/design/02-api-contracts.md`. Lengths and patterns come from `docs/design/01-data-model.md`.

### `packages/shared` layout

```
packages/shared/
├─ package.json          exports ./constants ./enums ./contracts ./validation → src/<name>/index.ts
├─ tsconfig.json
├─ jest.config.js        @swc/jest · 90% threshold · coverageReporters: text, json-summary
└─ src/
   ├─ constants/  limits.ts · patterns.ts · index.ts
   ├─ enums/      transaction-status.ts · delivery-status.ts · fee-rule.ts · card-brand.ts · error-code.ts · index.ts
   ├─ contracts/  common.ts · catalog.ts · locations.ts · quotes.ts · customers.ts · transactions.ts · deliveries.ts · health.ts · headers.ts · index.ts
   └─ validation/ messages.ts · card-brand.ts · luhn.ts · card-expiry.ts · customer.schema.ts · delivery.schema.ts · card.schema.ts · index.ts (+ *.spec.ts)
```

### constants/

```ts
// limits.ts: values nobody tunes per deployment
export const MAX_QUANTITY = 10;
export const INSTALLMENTS_MIN = 1;
export const INSTALLMENTS_MAX = 36;
export const RESERVATION_TTL_MS = 300_000;
export const POLL_INTERVAL_MS = 2_000;
export const POLL_TIMEOUT_MS = 60_000;
export const PAGE_SIZE_DEFAULT = 10;
export const PAGE_SIZE_MAX = 50;
export const CURRENCY = 'COP';
// Column lengths, shared by the web schemas and the api DTOs
export const FULL_NAME_MAX_LENGTH = 120;       // fullName, recipientName
export const EMAIL_MAX_LENGTH = 254;
export const ADDRESS_LINE_MAX_LENGTH = 200;
export const ADDRESS_DETAIL_MAX_LENGTH = 120;

// patterns.ts
export const PHONE_PATTERN = /^3[0-9]{9}$/;
export const NATIONAL_ID_PATTERN = /^[0-9]{6,10}$/;
export const MUNICIPALITY_CODE_PATTERN = /^[0-9]{5}$/;
export const DEPARTMENT_CODE_PATTERN = /^[0-9]{2}$/;
```

No fee values here: only the server computes money.

### enums/ (`as const` object + same-name union type)

```ts
export const TransactionStatus = {
  PENDING: 'PENDING', APPROVED: 'APPROVED', DECLINED: 'DECLINED',
  VOIDED: 'VOIDED', ERROR: 'ERROR', EXPIRED: 'EXPIRED',
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];
```

| Enum | Values |
|---|---|
| `TransactionStatus` | `PENDING`, `APPROVED`, `DECLINED`, `VOIDED`, `ERROR`, `EXPIRED` |
| `DeliveryStatus` | `AWAITING_PAYMENT`, `READY_TO_SHIP`, `CANCELLED` |
| `FeeRule` | `FREE_METRO`, `METRO_FLAT`, `NATIONAL_DISTANCE` |
| `CardBrand` | `VISA`, `MASTERCARD` |
| `ErrorCode` | `VALIDATION_ERROR`, `MISSING_IDEMPOTENCY_KEY`, `PRODUCT_NOT_FOUND`, `DEPARTMENT_NOT_FOUND`, `MUNICIPALITY_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `TRANSACTION_NOT_FOUND`, `DELIVERY_NOT_FOUND`, `OUT_OF_STOCK`, `PRICE_CHANGED`, `EMAIL_ALREADY_REGISTERED`, `CUSTOMER_DATA_MISMATCH`, `IDEMPOTENCY_KEY_REUSED`, `RATE_LIMITED`, `PAYMENT_GATEWAY_UNAVAILABLE`, `INVALID_SIGNATURE`, `INTERNAL_ERROR` |

### contracts/

```ts
// common.ts
export type Cents = number;                          // always an integer
export type Currency = typeof CURRENCY;
export interface ApiResponse<T> { data: T }
export interface PaginationMeta { page: number; limit: number; totalItems: number; totalPages: number }
export interface Paginated<T> { data: T[]; meta: PaginationMeta }
export interface FieldError { field: string; message: string }
export interface ProblemDetails {
  type: string; title: string; status: number; code: ErrorCode;
  detail: string; traceId: string; errors?: FieldError[];
}

// catalog.ts
export interface ProductListQuery { page?: number; limit?: number }
export interface ProductSummary {
  id: string; sku: string; name: string; brand: string;
  priceInCents: Cents; currency: Currency; imageUrl: string; stockAvailable: number;
}
export interface ProductDetail extends ProductSummary {
  description: string; vatIncludedInCents: Cents; maxPurchaseQuantity: number;
}

// locations.ts
export interface Department { code: string; name: string }
export interface Municipality { code: string; name: string; isMetroArea: boolean }

// quotes.ts
export interface QuoteQuery { productId: string; quantity: number; municipalityCode: string }
export interface Quote {
  product: { id: string; name: string; unitPriceInCents: Cents };
  quantity: number;
  subtotalInCents: Cents; vatIncludedInCents: Cents; baseFeeInCents: Cents;
  delivery: { feeInCents: Cents; rule: FeeRule; distanceKm: number; warehouse: { id: string; name: string } };
  totalInCents: Cents; currency: Currency;
}

// customers.ts
export interface UpsertCustomerRequest { documentNumber: string; fullName: string; email: string; phone: string }
export interface Customer extends UpsertCustomerRequest { id: string }

// transactions.ts
export interface PaymentInput {
  cardToken: string; cardBrand: CardBrand; cardLast4: string;
  acceptanceToken: string; personalAuthToken: string;
}
export interface DeliveryInput {
  recipientName: string; phone: string; addressLine: string;
  addressDetail?: string; municipalityCode: string;
}
export interface CreateTransactionRequest {
  customerId: string; productId: string; quantity: number; installments: number;
  expectedTotalInCents: Cents; payment: PaymentInput; delivery: DeliveryInput;
}
export interface TransactionCreated {
  id: string; reference: string; status: TransactionStatus; statusMessage: string | null;
  totalInCents: Cents; currency: Currency;
  delivery: { id: string; status: DeliveryStatus }; createdAt: string;
}
export interface TransactionView {
  id: string; reference: string; status: TransactionStatus; statusMessage: string | null;
  product: { id: string; name: string; imageUrl: string };
  quantity: number; installments: number;
  amounts: {
    unitPriceInCents: Cents; subtotalInCents: Cents; baseFeeInCents: Cents;
    deliveryFeeInCents: Cents; totalInCents: Cents; currency: Currency;
  };
  card: { brand: CardBrand; last4: string };
  delivery: { id: string; status: DeliveryStatus };
  createdAt: string; finalizedAt: string | null;
}

// deliveries.ts
export interface DeliveryView {
  id: string; transactionId: string; status: DeliveryStatus;
  warehouse: { id: string; name: string; municipalityName: string };
  destination: {
    recipientName: string; addressLine: string; addressDetail: string | null;
    municipalityName: string; departmentName: string;
  };
  distanceKm: number; feeRule: FeeRule; createdAt: string; updatedAt: string;
}

// health.ts
export interface HealthStatus { status: 'ok'; database: 'up' | 'down' }
export interface WebhookReceived { received: true }

// headers.ts
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';
export const REQUEST_ID_HEADER = 'X-Request-Id';
```

The gateway's webhook payload is not a contract of ours. It lives in the api adapter (api 06).

### validation/

```ts
// Helpers are pure; they work on digits only (spaces already stripped)
detectCardBrand(digits: string): CardBrand | null     // 4 → VISA · 51–55 / 2221–2720 → MASTERCARD
isSupportedBrandPrefix(digits: string): boolean       // false as soon as the prefix can no longer be VISA/MC
isValidLuhn(digits: string): boolean
checkExpiry(value: string, now: Date): 'VALID' | 'INVALID_FORMAT' | 'EXPIRED' | 'TOO_FAR'

// Schemas (types via z.infer)
customerSchema → CustomerFormValues  { documentNumber, fullName, email, phone }
deliverySchema → DeliveryFormValues  { recipientName, phone, departmentCode, municipalityCode, addressLine, addressDetail? }
cardSchema     → CardFormValues      { holder, number, expiry, cvc, installments }
```

- `cardSchema` accepts `4242 4242 4242 4242` and outputs `number` without spaces.
- `checkExpiry` treats the current month as valid, and anything more than 20 years ahead as `TOO_FAR`. Card-only limits (16 digits, holder 5–60, 20 years) are local constants in `validation/`; the api never sees card data.
- `installments` is `z.number().int()` in the 1–36 range. The web form sends it as a number (`valueAsNumber`).
- Every message is a constant in `messages.ts` (`VALIDATION_MESSAGES`), so web tests assert against the constant instead of repeating the text.

Field rules and messages (every text is trimmed before validation):

| Schema | Field | Rule | Message |
|---|---|---|---|
| `customerSchema` | `documentNumber` | `^[0-9]{6,10}$` | "Ingresa tu cédula (6 a 10 dígitos, sin puntos)" |
| | `fullName` | 1–120 characters | "Ingresa tu nombre completo" |
| | `email` | email format, max 254 | "Ingresa un correo válido" |
| | `phone` | `^3[0-9]{9}$` | "Ingresa un celular válido (10 dígitos, empieza por 3)" |
| `deliverySchema` | `recipientName` | 1–120 characters | "Ingresa el nombre de quien recibe" |
| | `phone` | `^3[0-9]{9}$` | "Ingresa un celular válido (10 dígitos, empieza por 3)" |
| | `departmentCode` | `^[0-9]{2}$` | "Selecciona un departamento" |
| | `municipalityCode` | `^[0-9]{5}$` (DANE) | "Selecciona un municipio" |
| | `addressLine` | 1–200 characters | "Ingresa la dirección de entrega" |
| | `addressDetail` | optional, max 120 | "Máximo 120 caracteres" |
| `cardSchema` | `holder` | 5–60 characters, letters (including accents and ñ) and spaces only | "Ingresa el nombre como aparece en la tarjeta" |
| | `number` | spaces stripped; prefix is not VISA/MC | "Solo aceptamos tarjetas VISA y Mastercard" |
| | | VISA/MC without 16 digits or failing Luhn | "Revisa el número de tu tarjeta" |
| | `expiry` | `MM/YY`, month 01–12 | "Usa el formato MM/AA" |
| | | before the current month | "La tarjeta está vencida" |
| | | more than 20 years ahead | "Revisa la fecha de vencimiento" |
| | `cvc` | `^[0-9]{3}$` | "El CVC son 3 dígitos" |
| | `installments` | integer from 1 to 36 | "Elige entre 1 y 36 cuotas" |

### Environment (`.env.example`)

```bash
# Database — docker-compose maps these to POSTGRES_* (local only)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=checkout
DB_PASSWORD=checkout
DB_NAME=checkout
# API
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
# Payment gateway (sandbox)
PAYMENT_GATEWAY_URL=https://replace-me.example.com/v1
PAYMENT_GATEWAY_PUBLIC_KEY=replace-me
PAYMENT_GATEWAY_PRIVATE_KEY=replace-me
PAYMENT_GATEWAY_INTEGRITY_SECRET=replace-me
PAYMENT_GATEWAY_EVENTS_SECRET=replace-me
# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=replace-me@example.com
SMTP_PASSWORD=replace-me
EMAIL_FROM="SoundHub <replace-me@example.com>"
# Web (Vite)
VITE_API_BASE_URL=/api/v1
VITE_API_MOCKING=true
VITE_PAYMENT_GATEWAY_URL=https://replace-me.example.com/v1
VITE_PAYMENT_GATEWAY_PUBLIC_KEY=replace-me
```

### CI coverage summary

Each `coverage (<workspace>)` job reads `<workspace>/coverage/coverage-summary.json` with `jq`. It appends a table to `$GITHUB_STEP_SUMMARY` with one row: Statements · Branches · Functions · Lines (`.total.<metric>.pct`). If the file does not exist (a shell with no `test:cov`), it writes "no coverage yet".

## Implementation plan

Prerequisites (not commits): `/spec-impl` creates and switches to `spec-01-infra-foundation` (`AutoCreateBranch: true`). The local `.env` does not exist yet; step 4 creates it from `.env.example`.

Each step is one commit after review. Target: ≤ ~300 changed lines per step, lockfile excluded.

### Part 1 — monorepo tooling

1. **Workspace skeleton.** Root `package.json` (private, `"type": "module"`, `packageManager`, `engines`, scripts `test` / `test:cov` as `pnpm -r --if-present …`), `pnpm-workspace.yaml`, `.nvmrc`, `.editorconfig`, and `.gitignore` extended for R7. Shell `package.json` files for `apps/api`, `apps/web`, `apps/e2e`, `infra` and `packages/shared`. `apps/api` and `apps/web` declare `"@checkout/shared": "workspace:*"`. First `pnpm-lock.yaml`.
   Manual test: `pnpm install` finishes; `pnpm -r ls --depth -1` lists the 5 workspaces; `pnpm test` exits 0.
   Commit: `chore: set up pnpm workspaces`.

2. **TypeScript.** `tsconfig.base.json` and a root `tsconfig.json` that covers `scripts/**` and root config files. `typescript` as a root dev dependency. Script `typecheck` = root `tsc --noEmit` + `pnpm -r --if-present typecheck`.
   Manual test: `pnpm typecheck` passes, including `scripts/gateway-spike.ts`.
   Commit: `chore: add strict TypeScript base config`.

3. **ESLint and Prettier.** `eslint.config.js` with every R3 rule, `.prettierrc`, `.prettierignore`, and scripts `lint` (`eslint . && prettier --check .`) and `format`. Prettier is applied once to the files in scope. If `scripts/gateway-spike.ts` breaks a rule, the minimal fix goes in this step.
   Manual test: `pnpm lint` passes. A throwaway file with `console.log`, a 4-parameter function, `any`, and `process.env` outside `config/` fails with those 4 rules, and is then deleted.
   Commit: `chore: enforce coding standards with ESLint and Prettier`.

4. **Local Postgres and env.** `docker-compose.yml` (`name: headphones-checkout`, Postgres 16, named volume, healthcheck, port 5432, `POSTGRES_*` from `DB_*`) and `.env.example` with the agreed list. Local `cp .env.example .env` (not committed).
   Manual test: `docker compose up -d postgres` reaches `healthy`; `docker compose ls` shows `headphones-checkout`.
   Commit: `chore: add local Postgres and env template`.

5. **Worktree helper.** `scripts/worktree-new.sh` and root script `worktree:new`. It takes the branch name, creates `../hc-<branch>` (a new branch from `main`, or checks out an existing one), symlinks the main checkout's `.env` and runs `pnpm install`. It fails with a clear message if the folder already exists or no branch name is given.
   Manual test: `pnpm worktree:new spec-test-x` → `pnpm test` passes inside `../hc-spec-test-x`; `docker compose up -d postgres` from there reuses the same container. Clean up with `git worktree remove` and `git branch -D spec-test-x`.
   Commit: `chore: add worktree helper`.

6. **CI workflow.** `.github/workflows/ci.yml` with jobs `lint`, `typecheck`, `coverage` (matrix `shared` / `api` / `web`, `test:cov --if-present`, `jq` table in the job summary), `api-integration` (Postgres 16 service, `migration:run` and `test:int -- --passWithNoTests`, both `--if-present`) and `e2e` (`if: false`). Node from `.nvmrc`, pnpm cache.
   Manual test: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint` reports no errors. The real run happens in step 12.
   Commit: `ci: add lint, typecheck, coverage, integration and e2e jobs`.

### Part 2 — `packages/shared`

7. **Package setup and constants.** `package.json` (subpath exports, `zod` dependency, scripts `typecheck` / `test` / `test:cov`), `tsconfig.json`, `jest.config.js` (`@swc/jest`, 90% threshold, `json-summary` reporter), `constants/limits.ts`, `constants/patterns.ts` and tests for the patterns.
   Manual test: `pnpm --filter @checkout/shared test:cov` passes the threshold; `pnpm test:cov` from the root runs it.
   Commit: `feat(shared): add package setup and constants`.

8. **Enums.** The five `as const` objects plus their union types, and an `index.ts`.
   Manual test: `pnpm typecheck` passes; a test checks that `ErrorCode` has the 17 codes from the contract.
   Commit: `feat(shared): add enums`.

9. **Contracts.** Every type in `contracts/`, plus `headers.ts`.
   Manual test: a throwaway `apps/api/scratch.ts` and `apps/web/scratch.ts` importing `@checkout/shared/contracts` type-check with `tsc --noEmit`, and are then deleted.
   Commit: `feat(shared): add API contract types`.

10. **Card helpers.** `validation/card-brand.ts` (`detectCardBrand`, `isSupportedBrandPrefix`), `luhn.ts`, `card-expiry.ts` (`checkExpiry` with an injected `now`), with tests.
    Manual test: tests cover 4242… (VISA), 5555… and 2221… (MASTERCARD), 3782… (unsupported), 4242 4242 4242 4241 (fails Luhn), and the current month, the previous month and +21 years.
    Commit: `feat(shared): add card validation helpers`.

11. **Form schemas.** `messages.ts`, `customer.schema.ts`, `delivery.schema.ts`, `card.schema.ts`, `validation/index.ts`, with tests for each rule and message.
    Manual test: `pnpm test:cov` ≥ 90% in `shared`; `grep -r "zod" packages/shared/src/constants packages/shared/src/enums packages/shared/src/contracts` returns nothing.
    Commit: `feat(shared): add customer, delivery and card form schemas`.

### Close-out

12. **SPEC 00 criterion, PR and green CI.** Tick SPEC 00's pending `pnpm lint` criterion. Push the branch and open the PR against `main` with `gh-cli`. Wait for CI and fix whatever fails. Mark this spec `Implemented` and tick its criteria.
    Manual test: every check on the PR is green, and the `coverage (shared)` summary shows the table with ≥ 90%.
    Commit: `docs: close spec 00 lint criterion and mark spec 01 as Implemented`.

Notes:

- If lint on `scripts/gateway-spike.ts` needs more than a trivial fix in step 3, stop and show the findings before touching it.
- `apps/api` and `apps/web` declare `@checkout/shared` from step 1, so step 9 can verify the imports; both apps need it anyway.
- If CI fails in step 12, the fix goes in its own `fix: …` commit, after review, before the `docs:` commit.

## Acceptance criteria

Tooling

- [x] On a clean clone with Node 22, `pnpm install && pnpm lint && pnpm typecheck && pnpm test` exits 0.
- [x] `pnpm -r ls --depth -1` lists `@checkout/api`, `@checkout/web`, `@checkout/e2e`, `@checkout/infra` and `@checkout/shared`.
- [x] `.nvmrc` contains `22`; root `package.json` has `engines.node: ">=22 <23"` and `packageManager: "pnpm@10.34.5"`.
- [x] `tsconfig.base.json` has `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: false` and `moduleResolution: "bundler"`.
- [x] A throwaway file (not committed) makes `pnpm lint` fail on each of: `console.log`, a 4-parameter function, `any`, a floating promise, `process.env` outside `**/config/**`, and a PascalCase file name.
- [x] The same `console.log` inside `scripts/` does not fail `pnpm lint`.
- [x] `pnpm lint` passes on `scripts/gateway-spike.ts`, and SPEC 00's pending criterion is ticked.
- [x] `prettier --check .` ignores every `*.md` file; `git diff main --stat` shows no change under `docs/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.
- [x] `.gitignore` ignores `node_modules`, `dist`, `coverage`, `.env`, `.env.local`, `cdk.out`, `playwright-report` and `test-results`, but not `.env.example`.

Local environment

- [x] With `.env` copied from `.env.example`, `docker compose up -d postgres` reaches `healthy` within 30 s.
- [x] `docker compose ls` shows the project as `headphones-checkout`.
- [x] `.env.example` contains exactly the 22 agreed variables, and every secret value is `replace-me` (or `replace-me@example.com` / a `replace-me` URL).
- [x] `pnpm worktree:new spec-test-x` creates `../hc-spec-test-x` with `.env` as a symlink to the main checkout's `.env`, and `pnpm test` passes inside it.
- [x] `docker compose up -d postgres` run from that worktree reuses the existing container (no second container, no port 5432 error).
- [x] `pnpm worktree:new` with no argument, or with an existing target folder, exits non-zero with a message and changes nothing.

CI

- [x] `actionlint` reports no errors on `.github/workflows/ci.yml`. — one accepted, documented exception: the `e2e` job's intentional `if: false` (see Decisions).
- [x] The PR shows green checks for `lint`, `typecheck`, `coverage (shared)`, `coverage (api)`, `coverage (web)` and `api-integration`; `e2e` shows as skipped.
- [x] The `coverage (shared)` job summary shows a table with Statements, Branches, Functions and Lines; `coverage (api)` and `coverage (web)` show "no coverage yet".
- [x] `ci.yml` calls `migration:run`, `test:int` and `test:cov` with `--if-present`.

`packages/shared`

- [x] `pnpm --filter @checkout/shared test:cov` passes with ≥ 90% statements, branches, functions and lines.
- [x] `packages/shared/package.json` exports exactly `./constants`, `./enums`, `./contracts` and `./validation`, and lists `zod` as its only runtime dependency.
- [x] No file under `src/constants`, `src/enums` or `src/contracts` imports `zod`.
- [x] A throwaway `scratch.ts` in `apps/api` and in `apps/web` that imports `CreateTransactionRequest` and `TransactionView` from `@checkout/shared/contracts` type-checks.
- [x] `ErrorCode` has exactly the 17 codes listed in the Data model; `CardBrand` has exactly `VISA` and `MASTERCARD`.
- [x] No `enum` keyword appears in `packages/shared/src`.
- [x] Every money field in `contracts/` ends in `InCents` and is typed `Cents`.
- [x] `constants/` contains no fee values.
- [x] `cardSchema` rejects `3782 822463 10005` with "Solo aceptamos tarjetas VISA y Mastercard".
- [x] `cardSchema` rejects `4242 4242 4242 4241` with "Revisa el número de tu tarjeta", and accepts `4242 4242 4242 4242`, returning `4242424242424242`.
- [x] `cardSchema` accepts the current month's `MM/YY`, rejects the previous month with "La tarjeta está vencida", and rejects a date 21 years ahead.
- [x] `cardSchema` rejects a 4-digit CVC, 0 installments and 37 installments.
- [x] `customerSchema` rejects an 11-digit phone, a phone starting with 2 and a 5-digit national ID, each with its agreed message.
- [x] `deliverySchema` rejects a 4-digit municipality code and a 201-character address, and accepts a missing `addressDetail`.

Non-negotiables

- [x] A case-insensitive search for the payment provider's brand name in the branch diff returns no match.
- [x] The branch diff contains no `.env`, key, secret or `coverage/` output.

## Decisions

Spec and branch

- **Yes:** one spec for both parts (tooling + shared contracts), one PR. api 01 and web 01 need both merged before they start, and the phase rule is one file = one spec = one PR.
- **No:** splitting into two specs. It adds a second PR and a second review cycle for no parallelism gain, since nothing else runs today.
- **Yes:** spec number `01` and branch `spec-01-infra-foundation`, created by `/spec-impl`. Same convention as SPEC 00.
- **No:** branch `feat/00-infra-foundation` from the phase file.

Node and pnpm

- **Yes:** `.nvmrc` = `22`, `engines.node: ">=22 <23"`, no `engine-strict`. CI runs Node 22; the local machine (Node 26) only gets a warning.
- **No:** `engine-strict=true`. It would block local installs until the Node version is switched.
- **Yes:** `packageManager: "pnpm@10.34.5"`, so CI and every worktree use the same pnpm.
- **Yes:** root `"type": "module"`. Root config and scripts run as ESM without `.mjs` names; each app sets its own `type`.

Lint and format

- **Yes:** `eslint-config-prettier` plus `prettier --check .` in `pnpm lint`. This is the setup the Prettier docs recommend: it is faster and keeps lint output readable.
- **No:** `eslint-plugin-prettier`. It runs Prettier as a lint rule: slower and noisier.
- **Yes:** Prettier ignores every `*.md`. The design and reference docs are off-limits for this spec, and reformatting them would add noise to their history.
- **Yes:** a root `tsconfig.json` covering `scripts/**`, so type-aware lint and typecheck reach `gateway-spike.ts`.
- **Yes:** minimal lint fixes to `scripts/gateway-spike.ts` inside step 3, if needed. SPEC 00 anticipated them in its Risks table.

Environment

- **Yes:** the full `.env.example` now (22 variables), so later phases only fill values instead of editing a file this spec owns.
- **Yes:** split `DB_*` fields instead of `DATABASE_URL`. The RDS secret in Secrets Manager delivers host, port, username and password separately.
- **No:** AWS-only variables (SQS URL, region, secret ARNs). CDK injects them in infra 05.
- **Yes:** fixed compose project name `headphones-checkout`, so every worktree shares one Postgres container.
- **Yes:** `pnpm worktree:new` in this spec. api 01 and web 01 start in parallel tomorrow and need it first. It covers the two things a bare `git worktree add` misses: `.env` and `node_modules`.
- **No:** the user's `/worktree` skill (`.trees/`). It would need extra ignores, and it is not known whether it handles `.env` and dependencies.
- **No:** implementing this spec inside a worktree. Nothing runs in parallel with it.

CI

- **Yes:** one `ci.yml` that creates every job now. Later phases never edit it, except web 08 to enable `e2e`.
- **Yes:** `--if-present` for `migration:run`, `test:int` and `test:cov`. Jobs are green no-ops until api 01 / web 01 add the scripts, and start running them with no edit to `ci.yml`.
- **No:** `if: false` on `api-integration`. It would force api 01 to edit `ci.yml`.
- **Yes:** the CI runs `test:cov` instead of `test` (a conscious deviation from R6). Coverage ≥ 80% is non-negotiable and `testing.md` says CI fails below it.
- **Yes:** a `coverage` matrix (`shared` / `api` / `web`), one check per workspace, each with a percentage table in its job summary. A coverage drop shows exactly which project caused it.
- **No:** separate workflow files per app with `paths` filters. `packages/shared` affects both apps, and a required check that does not run blocks the merge.
- **No:** coverage as a PR comment. It needs write permissions and a third-party action; the job summary shows the same data.
- **Accepted risk:** `--if-present` can hide a misnamed script (a false green). api 01 must include a criterion checking in the CI log that migrations and integration tests actually ran.

`packages/shared`

- **Yes:** enums as `as const` objects plus a same-name union type. They emit no special code and work with `isolatedModules` and every compiler that reads the package from source. A native `enum` only if something strictly requires it; nothing does in this spec.
- **No:** native TypeScript `enum`.
- **Yes:** `@swc/jest`. Fast; type checking stays in `pnpm typecheck`.
- **No:** `ts-jest`. Slower, and it duplicates the typecheck.
- **Yes:** column lengths in `constants/limits.ts`, so the web schemas and the api DTOs validate with the same numbers.
- **Yes:** `headers.ts` with the three contract header names, so neither app hard-codes them.
- **Yes:** `statusMessage: string | null` always present in `TransactionCreated` and `TransactionView`. The contract text says an `ERROR` carries it; one shape keeps the web's handling identical in both places.
- **No:** the gateway's webhook payload in `contracts/`. It is not our contract; it belongs to the api adapter (api 06).

Validation

- **Yes:** only VISA and MASTERCARD are accepted. The DB restricts `card_brand` to those two and FR-05 only covers them.
- **Yes:** a dedicated message for an unsupported brand ("Solo aceptamos tarjetas VISA y Mastercard"), shown as soon as the prefix rules it out. The user must understand the card is not accepted, not that it was mistyped.
- **Yes:** final Spanish messages inside the schemas, as `VALIDATION_MESSAGES` constants. DESIGN.md sets Colombian Spanish microcopy, and only the web consumes `/validation`.
- **No:** message keys plus a web-side dictionary. There is no multi-language requirement.
- **Yes:** `detectCardBrand` lives in `shared/validation`, and web's `lib/card-brand` reuses it instead of duplicating it.
- **Yes:** the card number accepts spaces and the schema strips them, so the form can mask the input.
- **Yes:** the current expiry month is valid (cards expire at the end of the month), with a 20-year upper bound.
- **Yes:** `departmentCode` in `deliverySchema`. The form needs it to load municipalities; web 03 drops it from the request.
- **Yes:** card holder 5–60 letters and spaces. This is our own proposal: the gateway's `card_holder` rules were not verified in the spike.

## Risks

| Risk | Mitigation |
| --- | --- |
| Nest compiles with `tsc` to CommonJS and does not compile TypeScript inside `node_modules`, so importing `@checkout/shared` from source can fail at runtime in api 01. | Out of scope here, but flagged for api 01: build with SWC or a bundler that follows the workspace link (esbuild is already planned for Lambda). The subpath exports do not change either way. |
| Vite reads `.env` from `apps/web` by default, not from the repository root. | web 01 sets `envDir` to the root. `.env.example` stays a single file at the root. |
| Type-aware ESLint (`projectService`) fails with "file not included in any tsconfig" on root files such as `eslint.config.js`. | Root `tsconfig.json` covers root config files and `scripts/**`; `allowDefaultProject` handles any remaining root `.js` file. |
| A Postgres already installed on the machine holds port 5432. | The compose port mapping reads `DB_PORT` from `.env`; changing it there fixes both compose and the api. |
| The top-level `name:` in `docker-compose.yml` is ignored by an older Compose. | Local Compose is v2.15.1, which supports it. Fallback: `COMPOSE_PROJECT_NAME=headphones-checkout` in `.env`. |
| Local Node 26 behaves differently from CI's Node 22 (a check passes locally and fails in CI). | CI is the reference. If something diverges, install Node 22 locally with nvm and reproduce there. |
| Zod 4 changed its API compared with v3 (`z.email()`, `error` instead of `message`), and older `@hookform/resolvers` versions do not support it. | Pin `zod@^4` in `shared`; web 01 uses `@hookform/resolvers` ≥ 5.1. Schema tests use only the Zod 4 API. |
| Expiry tests break around a month or year boundary, or on a different time zone. | `checkExpiry` takes `now` as a parameter; schema tests fix the date with `jest.useFakeTimers().setSystemTime(...)`. |
| A frozen contract turns out to be wrong or incomplete once api 01 / web 01 start. | Contract-change protocol from `PARALLELIZATION.md`: stop, minimal PR against `main`, rebase both sessions. |
| Lint on `scripts/gateway-spike.ts` needs more than a trivial fix. | Stop in step 3 and show the findings before touching it. |
| `--if-present` hides a misnamed script and CI stays green without testing anything. | Accepted. api 01 checks in the CI log that migrations and integration tests actually ran. |
| The first CI run fails for a reason not reproducible locally (cache, permissions, runner image). | Fix it in step 12 in its own `fix:` commit, after review. |

## What is **not** in this spec

- NestJS, Vite, React, Playwright or CDK code (api 01, web 01, web 08, infra 05).
- Per-app ESLint boundary rules and per-app Jest configs (api 01, web 01).
- Migrations, seed, and the `migration:run` / `test:int` scripts (api 01).
- Server-side DTOs, fee calculations and money formatting.
- How the card form looks and where its errors appear (web 03).
- Enabling the `e2e` job (web 08).
- AWS-only environment variables (infra 05).
- GitHub branch protection and required checks.
- Coverage as a PR comment, or separate workflow files per app.
- Any change to `docs/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

Each one of those, if it lands, goes in its own spec.
