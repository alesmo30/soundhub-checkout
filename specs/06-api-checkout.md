# SPEC 06 — API: checkout pricing, quote and customers

> **Status:** Approved
> **Depends on:** SPEC 04 (blocking: this spec starts only after SPEC 04 merges), SPEC 02 (ports, `UnitOfWork`, `respond()`)
> **Date:** 2026-09-26
> **Objective:** The server computes every amount the customer will pay through a side-effect-free `GET /quotes` whose delivery fee is chosen by the Strategy pattern, and creates or safely updates customers by national ID through `POST /customers` and `GET /customers/:id`.

> Source phase: `phases/saturday/api/03-checkout.md` (Part 1 pricing, Part 2 customers).
> SPEC 05 is reserved for the web catalog (`phases/saturday/web/02-catalog.md`), so this spec takes 06.
> The frozen `CustomerRepository.insert` port changes through the contract-change protocol before this spec's branch is created — see **Implementation plan → step 1**.

## Scope

**In:**

Contract change (separate PR, before this spec's branch)

- `CustomerRepository.insert` returns `ResultAsync<Customer, CustomerUniqueViolation>`, where `CustomerUniqueViolation = { constraint: 'DOCUMENT' | 'EMAIL' }`. Minimal PR against `main` touching only `customer.repository.port.ts`, per the contract-change protocol.

Pricing (`apps/api/src/modules/pricing/`)

- `GET /api/v1/quotes?productId&quantity&municipalityCode` → `Quote`.
  - A malformed query returns 400 `VALIDATION_ERROR` with `errors[]`: `productId` not uuid v4, `quantity` outside 1–`MAX_QUANTITY`, or `municipalityCode` not matching `MUNICIPALITY_CODE_PATTERN`.
  - An unknown or soft-deleted product returns 422 `PRODUCT_NOT_FOUND`, and an unknown municipality returns 422 `MUNICIPALITY_NOT_FOUND`.
  - `quantity > stockAvailable` returns 409 `OUT_OF_STOCK`.
  - `Cache-Control: no-store` on 200.
- Domain: `baseFeeInCents(subtotalInCents)` = `round((subtotal × 2.65% + 700 COP) × 1.19)`, rounded to the whole peso with integer arithmetic.
- Domain: a `DeliveryFeeStrategy` interface (`supports(ctx)`, `quote(ctx)`), and `FreeMetroStrategy`, `MetroFlatStrategy` and `NationalDistanceStrategy` as plain classes. `DeliveryFeeResolver` receives them in order, and the first match wins. `NationalDistanceStrategy` always matches.
- `GetQuoteUseCase` reads the product, the municipality and the active warehouses through the `catalog` and `locations` public APIs. It reuses `vatIncludedInCents` and `findNearestWarehouse`, and throws when there is no active warehouse (500 `INTERNAL_ERROR`).
- `GetQuoteUseCase` is exported through `pricing/index.ts`, and `PricingModule` exports it so api 04.1 can inject it.

Customers (`apps/api/src/modules/customers/`)

- `POST /api/v1/customers` upserts by national ID, following `01-data-model.md` §6:
  - new ID + free email → 201;
  - new ID + email of another ID → 409 `EMAIL_ALREADY_REGISTERED`;
  - existing ID + same email (case-insensitive) → 200, and name and phone are updated;
  - existing ID + different email → 409 `CUSTOMER_DATA_MISMATCH`, and nothing is written.
- The DTO trims every field and lowercases the email. Unknown fields return 400.
- Race safety: a `CustomerUniqueViolation` from `insert` triggers exactly one retry in a new transaction, which re-applies the §6 rules. A second violation throws (500).
- `GET /api/v1/customers/:id` returns 200, 400 on a non-uuid-v4 id, or 404 `CUSTOMER_NOT_FOUND`.
- Both customer endpoints send `Cache-Control: no-store`.
- `TypeOrmCustomerRepository` implements all five port methods. `findByEmail` is case-insensitive, and `insert` maps SQLSTATE `23505` on `uq_customers_document` / `uq_customers_email` to `Err`.
- Domain errors `emailAlreadyRegistered()`, `customerDataMismatch()` and `customerNotFound()` have generic `detail` texts that never include the document number, email or phone.
- `@nestjs/throttler` is added as a dependency, and `@Throttle` (20/min) goes on `POST /customers`. It stays inert until api 07 registers the guard.
- `CustomersModule` provides and exports `CUSTOMER_REPOSITORY`, so api 04.1 can resolve `customerId`.

Cross-cutting

- Request DTOs with `class-validator`, built from the `@checkout/shared/constants` patterns and lengths. Response DTOs `implements` the `@checkout/shared/contracts` interfaces (`Quote`, `Customer`). Everything is documented in Swagger.
- Tests:
  - table-driven domain specs;
  - use-case specs with in-memory fake ports;
  - controller specs through `configureApp()` + supertest with fakes;
  - a customer repository int-spec with rollback;
  - a concurrency int-spec that commits rows with random document numbers and emails;
  - a log-capture spec for `POST /customers`.
- Coverage ≥ 90 % on `pricing/domain`, and ≥ 80 % on `modules/pricing` and `modules/customers`.

**Out of scope (for future specs):**

- `POST /transactions`, stock reservation and `CreateTransactionUseCase` (api 04.1).
- Persisting quotes, or any server-side cache for them.
- Enabling throttling (`ThrottlerModule`, global guard, 429 with `Retry-After`) — api 07.
- Authentication (the customer uuid acts as the access capability, as documented in the contract).
- Searching customers by email or document number, now or later.
- Deleting customers, or any customer endpoint beyond the two above.
- A dedicated error code for "no active warehouse".
- The HTTP e2e suite against Postgres in `apps/api/test` (api 07).
- The web checkout screens (web 03).
- Any change to `catalog`, `locations`, `packages/shared`, `app.module.ts`, other modules, the ORM entities, `jest.config.ts`, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files. The only frozen-contract change is `CustomerRepository.insert`.

## Data model

This spec adds no tables, columns or migrations. It reuses the schema, ORM entities and domain types from SPEC 02, and the frozen ports as amended by step 1. The code-level structures it adds are below.

### New files

```
apps/api/src/modules/
├─ pricing/
│  ├─ index.ts                                    + GetQuoteUseCase
│  ├─ pricing.module.ts                           imports CatalogModule, LocationsModule · provides + exports GetQuoteUseCase
│  ├─ domain/
│  │  ├─ pricing.constants.ts · base-fee.ts · quote.errors.ts
│  │  └─ delivery-fee/
│  │     delivery-fee.strategy.ts · delivery-fee.resolver.ts
│  │     free-metro.strategy.ts · metro-flat.strategy.ts · national-distance.strategy.ts
│  ├─ application/use-cases/get-quote.use-case.ts
│  └─ infrastructure/http/
│     quotes.controller.ts (+ .spec.ts) · pricing-http.constants.ts
│     dto/{get-quote.query, quote, quote-response}.dto.ts
└─ customers/
   ├─ application/ports/customer.repository.port.ts   ~ insert → Err(CustomerUniqueViolation)   (step 1, separate PR)
   ├─ index.ts                                    unchanged (already re-exports the port file)
   ├─ customers.module.ts                         forFeature · CUSTOMER_REPOSITORY provider + export · use cases · controller
   ├─ domain/customer.errors.ts
   ├─ application/use-cases/
   │  upsert-customer.use-case.ts · get-customer.use-case.ts
   └─ infrastructure/
      ├─ persistence/
      │  customer.mapper.ts · typeorm-customer.repository.ts
      │  helpers/to-unique-violation.ts
      │  typeorm-customer.repository.int-spec.ts · upsert-customer.concurrency.int-spec.ts
      └─ http/
         customers.controller.ts (+ .spec.ts, + .logging.spec.ts) · customers-http.constants.ts
         dto/{upsert-customer, customer-id.params, customer, customer-response}.dto.ts
```

Unit specs (`*.spec.ts`) sit next to every domain file and use case.

### Contract change (step 1)

```ts
// customers/application/ports/customer.repository.port.ts
export interface CustomerUniqueViolation {
  readonly constraint: 'DOCUMENT' | 'EMAIL';   // uq_customers_document | uq_customers_email
}

insert(tx: TxContext, customer: NewCustomer): ResultAsync<Customer, CustomerUniqueViolation>;
// The other four methods are unchanged.
```

### Constants

```ts
// pricing/domain/pricing.constants.ts — all money in cents
export const BASE_FEE_RATE_BASIS_POINTS = 265;                // 2.65 %
export const BASE_FEE_FIXED_IN_CENTS = 70_000;                // 700 COP
export const BASE_FEE_VAT_PERCENT = 19;
export const FREE_METRO_MIN_SUBTOTAL_IN_CENTS = 20_000_000;   // 200,000 COP
export const METRO_FLAT_FEE_IN_CENTS = 2_000_000;             // 20,000 COP
export const NATIONAL_BASE_FEE_IN_CENTS = 2_000_000;          // 20,000 COP
export const NATIONAL_FREE_KM = 50;
export const NATIONAL_FEE_PER_KM_IN_CENTS = 6_000;            // 60 COP
export const NATIONAL_ROUNDING_STEP_IN_CENTS = 50_000;        // 500 COP, rounded up
export const NATIONAL_FEE_CAP_IN_CENTS = 6_000_000;           // 60,000 COP

// pricing/infrastructure/http/pricing-http.constants.ts
export const QUOTES_CACHE_CONTROL = 'no-store';

// customers/infrastructure/http/customers-http.constants.ts
export const CUSTOMERS_CACHE_CONTROL = 'no-store';
export const CUSTOMERS_THROTTLE = { default: { limit: 20, ttl: 60_000 } };   // inert until api 07
```

`MAX_QUANTITY`, `CURRENCY`, `MUNICIPALITY_CODE_PATTERN`, `NATIONAL_ID_PATTERN`, `PHONE_PATTERN`, `FULL_NAME_MAX_LENGTH` and `EMAIL_MAX_LENGTH` come from `@checkout/shared/constants`.

### Pricing domain

```ts
// pricing/domain/base-fee.ts — rounded to the whole peso, integer math only
export function baseFeeInCents(subtotalInCents: Cents): Cents;
//   = Math.round(((subtotal × 265 + 700_000_000) × 119) / 100_000_000) × 100
//   379_980_000 → 12_066_000   (120,659.693 COP → 120,660 COP; cent rounding would give 12_065_969)

// pricing/domain/delivery-fee/delivery-fee.strategy.ts
export interface DeliveryFeeContext {
  readonly subtotalInCents: Cents;
  readonly isMetroArea: boolean;
  readonly distanceKm: number;          // integer, from findNearestWarehouse
}
export interface DeliveryFee { readonly feeInCents: Cents; readonly rule: FeeRule }
export interface DeliveryFeeStrategy {
  supports(ctx: DeliveryFeeContext): boolean;
  quote(ctx: DeliveryFeeContext): DeliveryFee;
}

// Strategies, in resolver order
FreeMetroStrategy          supports: isMetroArea && subtotal ≥ 20_000_000   → { 0, FREE_METRO }
MetroFlatStrategy          supports: isMetroArea                             → { 2_000_000, METRO_FLAT }
NationalDistanceStrategy   supports: always
                           fee = min(ceilTo(2_000_000 + 6_000 × max(0, km − 50), 50_000), 6_000_000) → NATIONAL_DISTANCE
//   km 50 → 2_000_000 · km 51 → 2_006_000 → 2_050_000 · km 400 → 4_100_000 · km 717 → 6_000_000 (cap)

// pricing/domain/delivery-fee/delivery-fee.resolver.ts
export class DeliveryFeeResolver {
  constructor(private readonly strategies: readonly DeliveryFeeStrategy[]) {}
  resolve(ctx: DeliveryFeeContext): DeliveryFee;    // first match wins; no match throws (unreachable)
}

// pricing/domain/quote.errors.ts — 422/409 variants, since the status depends on the use case
export function quoteProductNotFound(): DomainError;          // PRODUCT_NOT_FOUND, kind UNPROCESSABLE
export function quoteMunicipalityNotFound(): DomainError;     // MUNICIPALITY_NOT_FOUND, kind UNPROCESSABLE
export function outOfStock(available: number): DomainError;   // OUT_OF_STOCK, kind CONFLICT, "Only N units available"
```

### Pricing use case

```ts
GetQuoteUseCase.execute(query: QuoteQuery): ResultAsync<Quote, DomainError>
```

1. Read the product (`findById`), the municipality (`findByCode`) and the warehouses (`listActive`) in parallel with `ResultAsync.combine`.
2. Decide in this order:
   - no product → `quoteProductNotFound`;
   - no municipality → `quoteMunicipalityNotFound`;
   - `quantity > stockAvailable` → `outOfStock`.
3. `findNearestWarehouse(municipality, warehouses)`. A `null` result throws `Error('No active warehouse')`.
4. `subtotal = price × quantity`, then `vatIncludedInCents(subtotal)`, `baseFeeInCents(subtotal)`, `resolver.resolve(ctx)`, and `total = subtotal + baseFee + deliveryFee`.

The view is the contract's `Quote` from `@checkout/shared/contracts`, so drift fails `typecheck`.

The resolver is built once in `pricing.module.ts` with a `useFactory` provider:

```ts
new DeliveryFeeResolver([new FreeMetroStrategy(), new MetroFlatStrategy(), new NationalDistanceStrategy()])
```

### Customers domain and use cases

```ts
// customers/domain/customer.errors.ts — generic details, never the document, email or phone
export function emailAlreadyRegistered(): DomainError;   // EMAIL_ALREADY_REGISTERED, CONFLICT
export function customerDataMismatch(): DomainError;     // CUSTOMER_DATA_MISMATCH, CONFLICT
export function customerNotFound(): DomainError;         // CUSTOMER_NOT_FOUND, NOT_FOUND

UpsertCustomerUseCase.execute(cmd: UpsertCustomerRequest): ResultAsync<{ customer: Customer; created: boolean }, DomainError>
//   execute  = uow.run(upsertOnce) → on CustomerUniqueViolation, uow.run(upsertOnce) once more → a second violation throws
//   upsertOnce(tx, cmd), which holds the §6 table:
//     findByDocumentNumber → found:   same email (case-insensitive) ? updateContact → created: false
//                                                                   : customerDataMismatch
//                          → missing: findByEmail → found ? emailAlreadyRegistered
//                                                         : insert → created: true

GetCustomerUseCase.execute(id: string): ResultAsync<Customer, DomainError>   // null → customerNotFound
```

### Customer repository

- `TypeOrmCustomerRepository` injects an `EntityManager` and uses `tx.manager` when given a `TypeOrmTxContext`, as in SPEC 04. TypeORM and `QueryBuilder` only, no raw SQL.
- `findByEmail`: `WHERE LOWER(email) = LOWER(:email)`, which is served by `uq_customers_email`.
- `insert`: `INSERT … RETURNING *`. A `QueryFailedError` with SQLSTATE `23505` on `uq_customers_document` or `uq_customers_email` becomes `Err({ constraint })` through the helper `toUniqueViolation`. Any other error is re-thrown.
- `updateContact`: `UPDATE … SET full_name, phone RETURNING *`.
- `customer.mapper.ts` turns the ORM entity into the `Customer` domain type.

### HTTP

| Endpoint | Request DTO | Response DTO | Status · header |
|---|---|---|---|
| `GET /quotes` | `GetQuoteQueryDto` (`@IsUUID('4')`, `@Type(() => Number) @IsInt @Min(1) @Max(MAX_QUANTITY)`, `@Matches(MUNICIPALITY_CODE_PATTERN)`) | `QuoteResponseDto { data: QuoteDto }` | 200 · `no-store` |
| `POST /customers` | `UpsertCustomerDto` (`@Transform` trim on all fields, lowercase on email; shared patterns and lengths) | `CustomerResponseDto { data: CustomerDto }` | 201 / 200 via `@Res({ passthrough: true })` · `no-store` · `@Throttle(CUSTOMERS_THROTTLE)` |
| `GET /customers/:id` | `CustomerIdParamsDto` (`@IsUUID('4')`) | `CustomerResponseDto` | 200 · `no-store` |

- `QuoteDto implements Quote`, and `CustomerDto implements Customer`. Nested quote DTOs cover `product`, `delivery` and `warehouse`.
- Error responses are documented with `@ApiBadRequestResponse`, `@ApiNotFoundResponse`, `@ApiConflictResponse` and `@ApiUnprocessableEntityResponse`.

## Implementation plan

Prerequisites (not commits):

- SPEC 04 is merged into `main`.
- `docker compose up -d postgres && pnpm --filter @checkout/api migration:run && pnpm --filter @checkout/api seed` before step 5.
- web 03 runs in parallel from its own worktree.

Each step is one commit after review. Target: ≤ ~300 changed lines per step. The only new dependency is `@nestjs/throttler` (step 10). If web 03 also touched the lockfile, apply the lockfile protocol before pushing.

### Contract change

1. [x] **Customer port reports unique violations.** On a branch `chore/customers-port-insert-violation` cut from `main`, add `CustomerUniqueViolation` and change `insert`'s error type in `customer.repository.port.ts`. Nothing else changes: no implementation or fake of this port exists yet. Open the PR with `gh-cli`, merge it, and only then let `/spec-impl` create `spec-06-api-checkout` from the updated `main`. This PR carries only the port change, so this box is ticked in step 2's commit.
   Manual test: `pnpm typecheck` green; the PR diff shows one file.
   Commit: `feat(api): let CustomerRepository.insert report unique violations`.

### Pricing

2. [x] **Base fee.** `pricing.constants.ts` and `base-fee.ts`, with a unit spec. The spec covers:
   - `379_980_000 → 12_066_000` (the contract example);
   - a subtotal whose fee lands exactly on `.5` pesos;
   - the smallest subtotal (one unit of the cheapest seeded product).

   Manual test: `pnpm --filter @checkout/api test` green.
   Commit: `feat(api): add base fee policy to pricing domain`.

3. [x] **Delivery fee strategies.** `delivery-fee.strategy.ts`, the three strategies and `DeliveryFeeResolver`, with table-driven specs. The specs cover:
   - metro with subtotal `19_999_900` → `METRO_FLAT 2_000_000`, and metro with `20_000_000` → `FREE_METRO 0`;
   - non-metro km 0 and 50 → `2_000_000`, km 51 → `2_050_000` (rounded up), km 400 → `4_100_000`;
   - km 716 and 717 → `6_000_000` (cap), and km 2000 → `6_000_000`;
   - a non-metro subtotal ≥ `20_000_000` that still pays `NATIONAL_DISTANCE`;
   - the resolver respects order, so a metro context with a high subtotal never reaches `METRO_FLAT`.

   Manual test: `test` green.
   Commit: `feat(api): add delivery fee strategies and resolver`.

4. [ ] **Get quote use case.** `quote.errors.ts` and `GetQuoteUseCase`, wired in `pricing.module.ts` (imports `CatalogModule` and `LocationsModule`, a resolver `useFactory` provider, and `GetQuoteUseCase` exported) and exported from `pricing/index.ts`. Unit specs over in-memory fake repositories cover:
   - 2 × `189_990_000` to a metro municipality → subtotal `379_980_000`, VAT `60_669_100`, base fee `12_066_000`, delivery `0 FREE_METRO`, total `392_046_000`, `currency: "COP"`;
   - a non-metro municipality → `NATIONAL_DISTANCE` with the nearest warehouse and its integer `distanceKm`;
   - 422 `PRODUCT_NOT_FOUND`, 422 `MUNICIPALITY_NOT_FOUND`, and 409 `OUT_OF_STOCK` with `quantity = stockAvailable + 1`;
   - `quantity = stockAvailable` is accepted;
   - the decision order when the product is missing and the quantity is also too high;
   - an empty warehouse list makes `execute` reject.

   Manual test: `test` green.
   Commit: `feat(api): add GetQuoteUseCase`.

5. [ ] **Quotes endpoint.** `quotes.controller.ts`, `pricing-http.constants.ts` and the quote DTOs. `quotes.controller.spec.ts` (`configureApp` + supertest + fakes) checks:
   - the `{ data: Quote }` envelope;
   - 400 with `errors[]` for a non-uuid `productId`, `quantity` 0, 11 and `abc`, and `municipalityCode` `0500`;
   - 400 for an unknown query parameter;
   - 422 and 409 as Problem Details;
   - `Cache-Control: no-store` on the 200.

   Manual test:
   - `curl -i 'localhost:3000/api/v1/quotes?productId=<WH-1000XM5 id>&quantity=2&municipalityCode=05001'` returns `totalInCents: 392046000`, `baseFeeInCents: 12066000`, `rule: "FREE_METRO"` and `Cache-Control: no-store`;
   - the same query with `municipalityCode=11001` (Bogotá) returns `NATIONAL_DISTANCE` with a positive `distanceKm`;
   - `/api/docs` shows the endpoint with its query constraints.

   Commit: `feat(api): expose GET /quotes`.

### Customers

6. [ ] **Customer repository.** `customer.mapper.ts`, `helpers/to-unique-violation.ts` and `TypeOrmCustomerRepository`, wired and exported from `customers.module.ts` (`forFeature`, `CUSTOMER_REPOSITORY` provider, export). `typeorm-customer.repository.int-spec.ts` runs each test inside a transaction that always rolls back, and proves:
   - `findById` and `findByDocumentNumber` return the row or `null`, and exclude soft-deleted rows;
   - `findByEmail('ANA@Mail.com')` finds `ana@mail.com`;
   - `insert` returns the created row;
   - a duplicate document returns `Err({ constraint: 'DOCUMENT' })`, and a duplicate email in different case returns `Err({ constraint: 'EMAIL' })`. Each violation is the test's last statement, since it aborts the transaction;
   - `updateContact` changes only `fullName` and `phone`.

   Manual test: `pnpm --filter @checkout/api test:int` green.
   Commit: `feat(api): implement TypeORM customer repository`.

7. [ ] **Customer use cases.** `customer.errors.ts`, `UpsertCustomerUseCase` and `GetCustomerUseCase`, with unit specs over a fake repository and a fake `UnitOfWork`. The specs cover:
   - every row of the §6 table, including the same email in different case;
   - the retry path: `insert` returns a violation, and the second attempt finds the existing row and returns `created: false` (same email) or `CUSTOMER_DATA_MISMATCH` (different email);
   - an `EMAIL` violation that ends in `EMAIL_ALREADY_REGISTERED`;
   - a second violation makes `execute` reject;
   - every error `detail` contains none of the input values;
   - `GetCustomerUseCase` returns the customer or `CUSTOMER_NOT_FOUND`.

   Manual test: `test` green.
   Commit: `feat(api): add upsert and get customer use cases`.

8. [ ] **Concurrency proof.** `upsert-customer.concurrency.int-spec.ts` uses the real `TypeOrmUnitOfWork` and repository. A test-only wrapper around the repository holds both attempts at a barrier after their reads, so both reach `insert` before either commits and the race is deterministic. Rows commit, with random document numbers and emails. The spec proves:
   - same new ID + same email → outcomes `{ created: true }` and `{ created: false }`, and exactly one row;
   - same new ID + different emails → one `created: true` and one `CUSTOMER_DATA_MISMATCH`, one row, and the winner's email unchanged;
   - two new IDs + the same email → one created and one `EMAIL_ALREADY_REGISTERED`.

   Manual test: `test:int` green three runs in a row.
   Commit: `test(api): prove concurrent customer upserts end with one row`.

9. [ ] **Customers endpoints.** `customers.controller.ts`, `customers-http.constants.ts` and the customer DTOs. `customers.controller.spec.ts` checks:
   - 201 then 200 for the same body, and 409 for both conflict codes;
   - `"  Ana@Mail.COM "` stored and returned as `ana@mail.com`;
   - 400 with `errors[]` for each invalid field, and for an unknown field such as `id`;
   - `GET /customers/:id` 200, 400 for `abc`, and 404 `CUSTOMER_NOT_FOUND`;
   - `Cache-Control: no-store` on every 200 and 201.

   `customers.controller.logging.spec.ts` captures the logger output during a `POST /customers` and a 409, and asserts that the raw document number, email and phone never appear.

   Manual test: `curl -i -X POST localhost:3000/api/v1/customers -H 'content-type: application/json' -d '{"documentNumber":"1017234567","fullName":"Ana Pérez","email":"ana@mail.com","phone":"3001234567"}'` returns 201. The same call again returns 200. With `"email":"otra@mail.com"` it returns 409 `CUSTOMER_DATA_MISMATCH`.
   Commit: `feat(api): expose POST /customers and GET /customers/:id`.

10. [ ] **Throttle hook.** Add `@nestjs/throttler` to `apps/api`, and `@Throttle(CUSTOMERS_THROTTLE)` on `POST /customers`. No `ThrottlerModule` or guard is registered. A controller spec asserts the metadata is present, and that 25 fast requests still get no 429.
    Manual test: `test` green; `pnpm install --frozen-lockfile` green.
    Commit: `chore(api): prepare throttle hook on POST /customers`.

### Close-out

11. [ ] **PR and green CI.** Run `pnpm --filter @checkout/api test:cov` and check in the report that `pricing/domain` is ≥ 90 %, and that `modules/pricing` and `modules/customers` are ≥ 80 % on all four metrics. Then push, open the PR with `gh-cli`, wait for CI and fix whatever fails. If web 03 merged first and touched the lockfile, apply the lockfile protocol. Finally, mark this spec `Implemented` and tick its criteria.
    Manual test: every check green.
    Commit: `docs: mark spec 06 as Implemented`.

Notes:

- If CI fails in step 11, the fix goes in its own `fix: …` commit, after review.
- If another frozen port or a `packages/shared` contract turns out to be wrong, stop and apply the contract-change protocol.
- Checkpoint C2 (web 03 against this API) runs after both PRs merge. It is not a step of this spec.

## Acceptance criteria

Contract change

- [ ] `CustomerRepository.insert` returns `ResultAsync<Customer, CustomerUniqueViolation>`, and that change reached `main` in its own PR, which touches only `customer.repository.port.ts`, before any other commit of this spec.

Quote

- [ ] `GET /api/v1/quotes?productId=<HP-SNY-WH1000XM5>&quantity=2&municipalityCode=05001` returns 200 with `subtotalInCents: 379980000`, `vatIncludedInCents: 60669100`, `baseFeeInCents: 12066000`, `delivery.feeInCents: 0`, `delivery.rule: "FREE_METRO"`, `totalInCents: 392046000` and `currency: "COP"`.
- [ ] The response has exactly the `Quote` fields, including `delivery.distanceKm` as an integer and `delivery.warehouse` as `{ id, name }`.
- [ ] A non-uuid `productId`, a `quantity` of 0, 11 or `abc`, a `municipalityCode` that is not 5 digits, or an unknown query parameter each returns 400 `VALIDATION_ERROR` with `errors[]`.
- [ ] An unknown or soft-deleted product returns 422 `PRODUCT_NOT_FOUND`, and an unknown municipality returns 422 `MUNICIPALITY_NOT_FOUND`.
- [ ] `quantity = stockAvailable + 1` returns 409 `OUT_OF_STOCK`, and `quantity = stockAvailable` returns 200.
- [ ] The 200 carries `Cache-Control: no-store`.
- [ ] Calling the endpoint writes nothing: the `products` row counts and `stock_available` values are the same before and after.
- [ ] With no active warehouse, the endpoint returns 500 `INTERNAL_ERROR` without internal details (proven by the use-case spec rejecting).

Pricing domain

- [ ] `baseFeeInCents(379_980_000) === 12_066_000`, and the function uses no floating-point rate.
- [ ] The strategy specs cover the boundaries 19,999,900 vs 20,000,000 cents, km 50 vs 51, rounding up to 500 COP, and the 60,000 COP cap at km 717.
- [ ] `DeliveryFeeResolver` returns the first matching strategy in the order FREE_METRO → METRO_FLAT → NATIONAL_DISTANCE.
- [ ] `pricing/index.ts` exports `GetQuoteUseCase`, and `PricingModule` exports it, so another module can inject it by importing `PricingModule`.

Customers

- [ ] `POST /api/v1/customers` returns:
  - 201 for a new ID with a free email;
  - 409 `EMAIL_ALREADY_REGISTERED` for a new ID with another ID's email;
  - 200 with name and phone updated for an existing ID with the same email in any case;
  - 409 `CUSTOMER_DATA_MISMATCH` for an existing ID with a different email, leaving the row unchanged.
- [ ] The body's fields are trimmed and the email is stored lowercase (`"  Ana@Mail.COM "` → `ana@mail.com`).
- [ ] An invalid document number, phone, email or name, or an unknown field, returns 400 `VALIDATION_ERROR` with `errors[]`.
- [ ] `GET /api/v1/customers/:id` returns 200 with `{ id, documentNumber, fullName, email, phone }`, 400 for a non-uuid-v4 id, and 404 `CUSTOMER_NOT_FOUND`.
- [ ] Both customer endpoints send `Cache-Control: no-store` on 200 and 201.
- [ ] The concurrency int-spec passes three runs in a row, and each scenario ends with exactly one row for the contested document number.
- [ ] Captured logs from `POST /customers` (success and 409) contain none of the raw document number, email or phone, and no customer error `detail` includes them.
- [ ] No endpoint, use case or repository method searches customers by email or document number from HTTP input other than the upsert itself.
- [ ] `POST /customers` carries `@Throttle` metadata with 20 requests per 60 s, and no throttler guard is registered yet.
- [ ] `CustomersModule` provides and exports `CUSTOMER_REPOSITORY`.

Swagger

- [ ] `/api/docs` shows `GET /quotes`, `POST /customers` and `GET /customers/:id` with their constraints, their success schemas (201 and 200 for `POST /customers`), and their error responses.
- [ ] `QuoteDto implements Quote` and `CustomerDto implements Customer`.

Quality and CI

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @checkout/api test:cov` and `pnpm --filter @checkout/api test:int` exit 0 locally.
- [ ] The coverage report shows `modules/pricing/domain` at ≥ 90 %, and `modules/pricing` and `modules/customers` at ≥ 80 %, on statements, branches, functions and lines. `apps/api` stays at ≥ 80 % globally.
- [ ] No raw SQL (`query(`, `manager.query`) exists under `modules/pricing` or `modules/customers`.
- [ ] The PR shows green `lint`, `typecheck`, `coverage (api)` and `api-integration`.
- [ ] `git diff main --stat` shows changes only under `apps/api/src/modules/pricing/`, `apps/api/src/modules/customers/`, `apps/api/package.json`, `pnpm-lock.yaml` and `specs/`.

## Decisions

Spec and branch

- **Yes:** one spec for both parts of `phases/saturday/api/03-checkout.md`, numbered 06 because SPEC 05 is reserved for the web catalog. `/spec-impl` creates `spec-06-api-checkout`. One branch and one PR, as SPEC 04 did for catalog + locations.
- **No:** two specs (pricing, customers). The phase is estimated at 2 h and the parts share the branch, the PR and the checkpoint C2.
- **No:** `feat/03-api-checkout` from the phase file.
- **Yes:** SPEC 04 is blocking. Pricing needs its repositories and exports, and two API sessions never run in parallel because they share the local Postgres.

Money

- **Yes:** the base fee is rounded to the whole peso with integer arithmetic: `Math.round(((subtotal × 265 + 700_000_000) × 119) / 100_000_000) × 100`. The contract's example (`12066000`) only reproduces this way, as SPEC 04 already found for VAT.
- **No:** rounding to the cent. It gives `12065969` and breaks the contract example.
- **No:** `0.0265` and `1.19` floats. Integer multiplication before division keeps the result exact.
- **Yes:** `BASE_FEE_VAT_PERCENT = 19` is declared in pricing instead of importing catalog's `VAT_RATE_PERCENT`. It is the VAT on the commission, not on the product, and `catalog/index.ts` must not change.
- **Yes:** VAT for the quote reuses `vatIncludedInCents(subtotal)` from catalog. One formula, one place.
- **Yes:** the national fee uses the integer `distanceKm` that `findNearestWarehouse` returns. The fee is computed from the same number that is shown to the user and stored in `deliveries.distance_km`.

Delivery-fee strategies

- **Yes:** strategies are plain domain classes, and `DeliveryFeeResolver` receives them as an ordered array built once in a `useFactory` provider. "First match wins" lives in one place, and the domain does not depend on Nest.
- **No:** strategies as Nest providers injected through a multi-token. The order would depend on registration, which is harder to read and to test.
- **Yes:** `NationalDistanceStrategy.supports` always returns `true`, so the resolver always resolves. Its "no match" branch throws and is unreachable by construction.

Quote

- **Yes:** `GET /quotes` sends `Cache-Control: no-store`. The quote depends on live stock and price, and a copy reused by the browser would show a number that is no longer true. CloudFront already disables caching on `/api/*`, so the risk was only the browser.
- **No:** leaving the header out. It works by accident of browser heuristics, not by contract.
- **Yes:** pricing has its own 422 errors (`quoteProductNotFound`, `quoteMunicipalityNotFound`). The status depends on the use case: a missing referenced resource is a 422 here and a 404 on `GET /products/:id`.
- **Yes:** the checks run in the order product → municipality → stock. The three reads run in parallel with `ResultAsync.combine`.
- **Yes:** no active warehouse throws, and the result is 500 `INTERNAL_ERROR`. It is a data misconfiguration the user cannot fix, and C9 reserves `throw` for truly unexpected failures. In api 04.1 it fires before any reservation, so nothing is created.
- **No:** a new `NO_WAREHOUSE_AVAILABLE` code (a contract change for a case real data never reaches), or reusing `MUNICIPALITY_NOT_FOUND` (it would lie).
- **Yes:** `GetQuoteUseCase` takes no `tx`. api 04.1 quotes before opening its reservation transaction.

Customers

- **Yes:** `CustomerRepository.insert` reports `CustomerUniqueViolation` through the contract-change protocol (a separate minimal PR against `main`). The repository maps SQLSTATE `23505` to `Err`, and the application never inspects TypeORM errors.
- **No:** keeping the port and catching the rejection in the use case with `ResultAsync.fromPromise`. The application layer would recognise infrastructure errors, and C9 would be bent.
- **No:** accepting a 500 for the loser of a race. The customer would see a generic error in checkout.
- **Yes:** on a violation, the use case retries once, server-side, in a new transaction, and re-applies the whole §6 table. A failed statement aborts the Postgres transaction, so the retry cannot reuse it.
- **No:** having the retry only "fetch the existing row". With a different email, the loser would receive the winner's email and phone.
- **No:** a client-side retry. It would need a new `ErrorCode` and front-end handling for something the server can resolve transparently.
- **Yes:** one retry only. A second violation throws, so there is never a loop.
- **Yes:** `upsertOnce` is a private method holding the §6 decisions, with `execute` running attempt → retry. This is C3's multi-phase exception.
- **Yes:** an existing ID with the same email always calls `updateContact`, even if nothing changed. It is simpler, and the only side effect is `updated_at`.
- **Yes:** the DTO trims every field and lowercases the email. There is one canonical form in the database, and comparisons match `uq_customers_email`. The backend does not trust the web's Zod trim.
- **No:** storing the email as typed and comparing only case-insensitively.
- **Yes:** customer error `detail` texts are generic. The logger already redacts `documentNumber`, `email` and `phone` keys, but a value interpolated into a message string would escape redaction.
- **Yes:** `POST /customers` returns 201 or 200 through `@Res({ passthrough: true })`. The status depends on the use-case result, and the handler still returns the envelope normally.

Rate limiting

- **Yes:** `@nestjs/throttler` is added now, and `@Throttle` (20/min) goes on `POST /customers` as metadata only. The phase asks for the hook, and api 07 only has to register the guard.
- **No:** only a named constant, with the dependency deferred to api 07.
- **Yes:** the dependency lands in its own step, so a lockfile conflict with web 03 is isolated in one commit.

Testing

- **Yes:** the concurrency int-spec uses a test-only barrier after the reads. Without it, `Promise.all` may run one upsert fully before the other, and the test would pass without exercising the race.
- **Yes:** the concurrency int-spec commits rows with random document numbers and emails. Two real transactions must commit to race. `customers` is never listed publicly, as SPEC 02 already argued.
- **Yes:** the customer repository int-spec rolls back, with one unique violation per test as its last statement.
- **Yes:** a log-capture spec proves that PII stays out of the logs. It is the only way to make "logs never contain…" boolean.
- **Yes:** controller specs run through `configureApp()` + supertest with fakes, and no database. The full HTTP e2e suite stays in api 07.

## Risks

| Risk | Mitigation |
| --- | --- |
| No `@nestjs/throttler` release declares Nest 12 in its peer dependencies. | Check the peer range before installing. If none fits, stop, report, and fall back to the named constant alone (`CUSTOMERS_THROTTLE`), recording the change in **Decisions**. |
| TypeORM's `QueryFailedError` exposes SQLSTATE and constraint under a different shape than assumed (`driverError.code`, `driverError.constraint`). | `to-unique-violation.ts` narrows with `instanceof` and type guards, never an `as` cast. The repository int-spec triggers both constraints for real, so a wrong shape fails there. |
| The concurrency int-spec hangs or flakes: the barrier waits forever if one attempt fails before reaching it, or the scheduler serialises the two upserts. | The barrier has a timeout that fails the test with a clear message. The step's manual test runs `test:int` three times in a row. |
| `baseFeeInCents`'s intermediate product exceeds `Number.MAX_SAFE_INTEGER`. | Only above ≈ 2,800 million COP of subtotal. The maximum is `MAX_QUANTITY` × the priciest product (≈ 19 million COP). The spec asserts `Number.isSafeInteger` on that worst case. |
| `@Res({ passthrough: true })` interacts badly with `@Header()` or the Swagger plugin. | The controller spec asserts status 201/200 and `Cache-Control: no-store` on both paths. `/api/docs` is checked in step 9's manual test. |
| The seeded Medellín warehouse yields a `distanceKm` other than the contract example's `4`. | Acceptance criteria only assert an integer `distanceKm`. `FREE_METRO` makes the fee independent of it, so the total still matches exactly. |
| Capturing the logger output in a spec is harder than expected with `nestjs-pino`. | Build the test app with pino writing to an in-memory stream. If the logger module cannot take one, stop and report before touching `logger.module.ts`, which belongs to SPEC 02. |
| SPEC 04's final code uses different names than assumed here (`findNearestWarehouse`, `listActive` order, repository tokens, `respond()`). | Adapt the names, not the shape. If a frozen port itself is wrong, stop and apply the contract-change protocol. |
| web 03 merges first and `pnpm-lock.yaml` conflicts. | Step 10 isolates the dependency. Apply the lockfile protocol: `git checkout main -- pnpm-lock.yaml && pnpm install`. |

## What is **not** in this spec

- `POST /transactions`, stock reservation and `CreateTransactionUseCase` (api 04.1).
- Persisting quotes, or any server-side quote cache.
- Enabling throttling: `ThrottlerModule`, global guard, 429 with `Retry-After` (api 07).
- Authentication.
- Searching customers by email or document number, or any customer endpoint beyond `POST /customers` and `GET /customers/:id`.
- A dedicated error code for "no active warehouse".
- The HTTP e2e suite against Postgres in `apps/api/test` (api 07).
- The web checkout screens (web 03).
- Any change to `catalog`, `locations`, `packages/shared`, `app.module.ts`, other modules, the ORM entities, `jest.config.ts`, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files. The only frozen-contract change is `CustomerRepository.insert`.

Each of these, if it lands, goes in its own spec.
