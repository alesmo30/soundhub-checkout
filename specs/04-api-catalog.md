# SPEC 04 — API: catalog and locations (read endpoints and distance functions)

> **Status:** Approved
> **Depends on:** SPEC 02 (blocking: this spec starts only after SPEC 02 merges; web 02 runs in parallel against MSW)
> **Date:** 2026-09-26
> **Objective:** Expose the storefront's read side (paginated products with available stock, product detail with its VAT breakdown, and the department → municipality catalog) and export the pure distance functions that pricing will reuse.

> This spec consolidates two drafts produced independently for the same phase file
> (`phases/saturday/api/02-catalog.md`) by mistake — one of the two `/spec` runs
> should have targeted `phases/saturday/web/02-catalog.md` instead. The web-side
> catalog spec is SPEC 05 (`05-web-catalog.md`). The draft that computed `vatIncludedInCents` without rounding to the
> whole peso (matching `189_990_000 → 30_334_538`-style values instead of the
> contract's `30_334_500`) was discarded in favor of the one below, which
> reproduces `02-api-contracts.md`'s worked example exactly — see **Decisions → Money**.

## Scope

**In:**

Catalog (`apps/api/src/modules/catalog/`)

- `GET /api/v1/products?page&limit` → `Paginated<ProductSummary>`, ordered by `(created_at, id)`, soft-deleted rows excluded. `page ≥ 1` (default 1), `limit` 1–50 (default 10). A page past the end returns 200 with `data: []` and the real `meta`.
- `GET /api/v1/products/:id` → `ProductDetail` with `vatIncludedInCents` and `maxPurchaseQuantity = min(stockAvailable, MAX_QUANTITY)`. A non-uuid-v4 id returns 400 with `errors[]`, and a missing or soft-deleted product returns 404 `PRODUCT_NOT_FOUND`.
- Domain: `vatIncludedInCents(priceInCents)`, rounded to the whole peso with integer arithmetic, and `maxPurchaseQuantity(stockAvailable)`. Both are pure functions with unit tests, and `vatIncludedInCents` is exported through `index.ts` for pricing.
- `TypeOrmProductRepository` implementing both methods of the frozen `ProductRepository` (`findPage`, `findById` with optional `tx`).

Locations (`apps/api/src/modules/locations/`)

- `GET /api/v1/locations/departments` → `Department[]` sorted by name.
- `GET /api/v1/locations/departments/:code/municipalities` → `Municipality[]` (`code`, `name`, `isMetroArea`) sorted by name. A `:code` that is not 2 digits returns 400, and a well-formed code with no municipalities returns 404 `DEPARTMENT_NOT_FOUND`.
- Domain: `haversineKm(a, b)` (unrounded km) and `findNearestWarehouse(origin, warehouses)` → `{ warehouse, distanceKm } | null` (km rounded with `Math.round`; the first warehouse wins a tie). Both are pure functions, unit-tested with known city pairs, and exported through `index.ts` for pricing.
- `TypeOrmMunicipalityRepository` and `TypeOrmWarehouseRepository` implementing every method of their frozen ports (`listDepartments`, `listByDepartment`, `findByCode`, `listActive`, `findById`).

Cross-cutting

- `Cache-Control` only on 200 responses: `public, max-age=10` on products, `public, max-age=86400` on locations. Error responses carry no public cache header.
- `respondPaginated()` next to `respond()` in `src/shared/infrastructure/http/respond.ts`, producing `{ data, meta }` at the top level.
- Request DTOs (query and params) with `class-validator`, and response DTO classes that `implements` the `@checkout/shared/contracts` interfaces, documented in Swagger through the CLI plugin.
- Each module wires its providers and exports its repository tokens (`PRODUCT_REPOSITORY`, `MUNICIPALITY_REPOSITORY`, `WAREHOUSE_REPOSITORY`) so api 03 and api 04.1 can inject them.
- Tests: domain and use-case unit tests with in-memory fake ports; controller specs through `configureApp()` + supertest with fake repositories (no database); one repository int-spec per repository, each running inside a transaction that always rolls back.

**Out of scope (for future specs):**

- `GET /quotes`, the base fee and the delivery-fee strategies (api 03).
- The `StockReservationPort` adapter and its raw SQL (api 04.1).
- Any write endpoint on products, municipalities or warehouses.
- A server-side cache (in-memory or Redis). Caching here is only the HTTP header.
- Absolute image URLs or a CDN base-URL env var. `imageUrl` is returned as stored.
- The HTTP e2e suite in `apps/api/test` against the full `AppModule` with a database.
- Rate limiting (api 07) and product image files (web 02).
- Any change to `app.module.ts`, `packages/shared`, other modules, the frozen ports, the ORM entities, `jest.config.ts`, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.

## Data model

This spec adds no tables, columns or migrations. It reuses the schema, ORM entities, domain types and frozen ports from SPEC 02, and only adds the code-level structures below.

### New files

```
apps/api/src/
├─ shared/infrastructure/http/respond.ts            + respondPaginated()
├─ modules/catalog/
│  ├─ index.ts                                      + vatIncludedInCents
│  ├─ catalog.module.ts                             providers, forFeature, exports PRODUCT_REPOSITORY
│  ├─ domain/          catalog.constants.ts · vat.ts · purchase-limit.ts · product.errors.ts
│  ├─ application/use-cases/
│  │                   list-products.use-case.ts · get-product-detail.use-case.ts
│  │                   helpers/{to-product-summary.ts, build-pagination-meta.ts}
│  └─ infrastructure/
│     ├─ persistence/  product.mapper.ts · typeorm-product.repository.ts (+ .int-spec.ts)
│     └─ http/         products.controller.ts (+ .spec.ts) · catalog-http.constants.ts
│                      dto/{list-products.query, product-id.params, product-summary,
│                           product-detail, pagination-meta, product-responses}.dto.ts
└─ modules/locations/
   ├─ index.ts                                      + haversineKm, findNearestWarehouse, GeoPoint, NearestWarehouse
   ├─ locations.module.ts                           providers, forFeature, exports MUNICIPALITY_REPOSITORY, WAREHOUSE_REPOSITORY
   ├─ domain/          locations.constants.ts · geo-point.ts · haversine.ts
   │                   nearest-warehouse.finder.ts · location.errors.ts
   ├─ application/use-cases/
   │                   list-departments.use-case.ts · list-municipalities.use-case.ts
   └─ infrastructure/
      ├─ persistence/  municipality.mapper.ts · warehouse.mapper.ts
      │                typeorm-municipality.repository.ts · typeorm-warehouse.repository.ts (+ .int-spec.ts each)
      └─ http/         locations.controller.ts (+ .spec.ts) · locations-http.constants.ts
                       dto/{department-code.params, department, municipality, location-responses}.dto.ts
```

Unit specs (`*.spec.ts`) sit next to every domain file and use case.

### Constants

```ts
// catalog/domain/catalog.constants.ts
export const VAT_RATE_PERCENT = 19;

// locations/domain/locations.constants.ts
export const EARTH_RADIUS_KM = 6371;

// catalog/infrastructure/http/catalog-http.constants.ts
export const PRODUCTS_CACHE_CONTROL = 'public, max-age=10';

// locations/infrastructure/http/locations-http.constants.ts
export const LOCATIONS_CACHE_CONTROL = 'public, max-age=86400';
```

`MAX_QUANTITY`, `PAGE_SIZE_DEFAULT`, `PAGE_SIZE_MAX`, `CURRENCY` and `DEPARTMENT_CODE_PATTERN` come from `@checkout/shared/constants` — `DEPARTMENT_CODE_PATTERN` is already frozen there (SPEC 01) for the shared web/api validation rules, so it is imported, not redeclared, in `locations`.

### Domain (pure functions)

```ts
// catalog/domain/vat.ts — VAT contained in a VAT-included price, rounded to the whole peso
export function vatIncludedInCents(priceInCents: Cents): Cents;
//   = Math.round((priceInCents * 19) / (119 * 100)) * 100      integer math, no 1.19 float
//   189_990_000 → 30_334_500 · 379_980_000 → 60_669_100 (the /quotes example)

// catalog/domain/purchase-limit.ts
export function maxPurchaseQuantity(stockAvailable: number): number;   // min(stock, MAX_QUANTITY)
//   MAX_QUANTITY caps units per order regardless of inventory — it mirrors the frozen
//   transactions.quantity CHECK (BETWEEN 1 AND 10) in 01-data-model.md, not a stock-driven rule.
//   A product may have stockAvailable above 10 (SPEC 02's seed does, to show "normal stock");
//   the cap still applies.

// catalog/domain/product.errors.ts
export function productNotFound(id: string): DomainError;              // PRODUCT_NOT_FOUND, kind NOT_FOUND

// locations/domain/geo-point.ts
export interface GeoPoint { readonly latitude: number; readonly longitude: number }   // Municipality and Warehouse satisfy it

// locations/domain/haversine.ts
export function haversineKm(a: GeoPoint, b: GeoPoint): number;         // unrounded

// locations/domain/nearest-warehouse.finder.ts
export interface NearestWarehouse { readonly warehouse: Warehouse; readonly distanceKm: number }   // integer km
export function findNearestWarehouse(origin: GeoPoint, warehouses: readonly Warehouse[]): NearestWarehouse | null;
//   null on an empty list · Math.round on the winner's distance · the first warehouse wins a tie

// locations/domain/location.errors.ts
export function departmentNotFound(code: string): DomainError;         // DEPARTMENT_NOT_FOUND, kind NOT_FOUND
```

### Use cases

Views are typed with the frozen contracts from `@checkout/shared/contracts`, so drift fails `typecheck`.

```ts
ListProductsUseCase.execute(query: { page: number; limit: number }): ResultAsync<Paginated<ProductSummary>, never>
GetProductDetailUseCase.execute(id: string): ResultAsync<ProductDetail, DomainError>          // null → productNotFound
ListDepartmentsUseCase.execute(): ResultAsync<Department[], never>
ListMunicipalitiesUseCase.execute(departmentCode: string): ResultAsync<MunicipalityView[], DomainError>
//   MunicipalityView = contracts' Municipality { code, name, isMetroArea } · empty list → departmentNotFound

// helpers (mechanical, no decisions)
toProductSummary(product: Product): ProductSummary                      // adds currency: CURRENCY
buildPaginationMeta(input: { page: number; limit: number; totalItems: number }): PaginationMeta
//   totalPages = Math.ceil(totalItems / limit) → 0 when there are no products
```

### Repositories

```ts
@Injectable()
export class TypeOrmProductRepository implements ProductRepository {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}
}
```

- Each repository receives an `EntityManager` in its constructor. The int-specs build it from a `QueryRunner` inside a transaction that always rolls back.
- On reads with `tx`, the repository uses `tx.manager` after narrowing with `instanceof TypeOrmTxContext`, and falls back to its own manager otherwise.
- TypeORM repositories and `QueryBuilder` only; no raw SQL. `@DeleteDateColumn` excludes soft-deleted rows.
- `findPage`: `findAndCount` with `order { createdAt: ASC, id: ASC }`, `skip (page − 1) × limit`, `take limit`.
- `listDepartments`: `SELECT DISTINCT department_code, department_name … ORDER BY department_name` through `QueryBuilder`.
- `listByDepartment`: `WHERE department_code = :code ORDER BY name`, served by `idx_municipalities_department`.
- `listActive`: every non-deleted warehouse, `ORDER BY name`, so the "first wins a tie" rule is deterministic.
- Mappers (`toProduct`, `toMunicipality`, `toWarehouse`) turn ORM entities into the SPEC 02 domain types.

### HTTP

```ts
// shared/infrastructure/http/respond.ts
export function respondPaginated<T>(result: ResultAsync<Paginated<T>, DomainError>): Promise<Paginated<T>>;
//   returns { data, meta } at the top level; Err → DomainErrorException, same as respond()
```

| Endpoint | Request DTO | Response DTO (`@ApiOkResponse`) | Header on 200 |
|---|---|---|---|
| `GET /products` | `ListProductsQueryDto` (`@Type(() => Number)`, `@IsInt`, `@Min(1)`, `@Max(PAGE_SIZE_MAX)`, defaults) | `PaginatedProductsResponseDto { data: ProductSummaryDto[]; meta: PaginationMetaDto }` | `PRODUCTS_CACHE_CONTROL` |
| `GET /products/:id` | `ProductIdParamsDto` (`@IsUUID('4')`) | `ProductDetailResponseDto { data: ProductDetailDto }` | `PRODUCTS_CACHE_CONTROL` |
| `GET /locations/departments` | — | `DepartmentListResponseDto { data: DepartmentDto[] }` | `LOCATIONS_CACHE_CONTROL` |
| `GET /locations/departments/:code/municipalities` | `DepartmentCodeParamsDto` (`@Matches(DEPARTMENT_CODE_PATTERN)`) | `MunicipalityListResponseDto { data: MunicipalityDto[] }` | `LOCATIONS_CACHE_CONTROL` |

- Response DTOs `implements` the shared contract interfaces (`ProductSummaryDto implements ProductSummary`, `ProductDetailDto extends ProductSummaryDto implements ProductDetail`, …).
- `Cache-Control` is set with Nest's `@Header()`. Nest applies it only when the handler returns normally, so error responses from the `ProblemDetailsFilter` do not carry it. A controller spec proves this.
- Error responses are documented with `@ApiBadRequestResponse` / `@ApiNotFoundResponse`.

## Implementation plan

Prerequisites (not commits):

- SPEC 02 is merged into `main`.
- `/spec-impl` creates and switches to `spec-04-api-catalog` (`AutoCreateBranch: true`).
- `docker compose up -d postgres && pnpm --filter @checkout/api migration:run && pnpm --filter @checkout/api seed` before step 3.
- web 02 runs in parallel from its own worktree.

Each step is one commit after review. Target: ≤ ~300 changed lines per step. No new dependencies are expected; if one turns out to be needed, apply the lockfile protocol before pushing.

### Domain

1. [x] **Catalog domain.** `catalog.constants.ts`, `vat.ts`, `purchase-limit.ts` and `product.errors.ts`, with unit specs, plus `vatIncludedInCents` exported from `catalog/index.ts`. The specs cover:
   - `189_990_000 → 30_334_500` and `379_980_000 → 60_669_100`;
   - a price whose VAT lands exactly on `.5` pesos;
   - `maxPurchaseQuantity` for stock 0, 1, 10 and 25.

   Manual test: `pnpm --filter @checkout/api test` green.
   Commit: `feat(api): add VAT breakdown and purchase limit to catalog domain`.

2. [x] **Locations domain.** `locations.constants.ts`, `geo-point.ts`, `haversine.ts`, `nearest-warehouse.finder.ts` and `location.errors.ts`, with unit specs, plus `haversineKm`, `findNearestWarehouse`, `GeoPoint` and `NearestWarehouse` exported from `locations/index.ts`. The specs cover:
   - Medellín ↔ Bogotá ≈ 240 km (± 5) and two more known city pairs;
   - distance 0 for the same point;
   - an empty warehouse list returning `null`;
   - a tie resolved in favour of the first warehouse;
   - `Math.round` applied to the winner's distance.

   Manual test: `test` green.
   Commit: `feat(api): add haversine distance and nearest warehouse finder`.

### Persistence

3. [x] **Product repository.** `product.mapper.ts` and `TypeOrmProductRepository`, wired in `catalog.module.ts` (`forFeature`, `PRODUCT_REPOSITORY` provider, export). `typeorm-product.repository.int-spec.ts` runs inside a transaction that always rolls back and proves:
   - `(created_at, id)` order, including two rows with the same `created_at`;
   - `skip` / `take` and `totalItems`;
   - soft-deleted rows excluded from `findPage` and `findById`;
   - `findById` returns `null` for an unknown id;
   - `findById(id, tx)` sees a row inserted in that same `tx`.

   Manual test: `pnpm --filter @checkout/api test:int` green, and the local catalog shows no new rows afterwards.
   Commit: `feat(api): implement TypeORM product repository`.

4. [x] **Municipality repository.** `municipality.mapper.ts` and `TypeOrmMunicipalityRepository`, wired and exported from `locations.module.ts`. The rollback int-spec proves:
   - `listDepartments` is distinct and sorted by name;
   - `listByDepartment` is sorted by name, excludes soft-deleted rows and returns `[]` for an unknown code;
   - `findByCode` works with and without `tx`;
   - coordinates come back as `number`.

   Manual test: `test:int` green.
   Commit: `feat(api): implement TypeORM municipality repository`.

5. [ ] **Warehouse repository.** `warehouse.mapper.ts` and `TypeOrmWarehouseRepository`, wired and exported. The rollback int-spec proves:
   - `listActive` excludes soft-deleted rows and is ordered by name;
   - `findById` returns the row, or `null` for an unknown id.

   Manual test: `test:int` green.
   Commit: `feat(api): implement TypeORM warehouse repository`.

### Application and HTTP

6. [ ] **Catalog use cases.** `ListProductsUseCase`, `GetProductDetailUseCase` and the helpers `toProductSummary` / `buildPaginationMeta`, with unit specs over an in-memory fake `ProductRepository`. The specs cover:
   - `meta` on the first page, a middle page, the last page and a page past the end;
   - `totalPages` 0 on an empty catalog;
   - the detail's VAT and `maxPurchaseQuantity`;
   - `PRODUCT_NOT_FOUND` for an unknown id.

   Manual test: `test` green.
   Commit: `feat(api): add list products and product detail use cases`.

7. [ ] **Products endpoints.** `respondPaginated()` in `shared/infrastructure/http/respond.ts` (with its spec extended), `products.controller.ts`, the catalog request and response DTOs and `catalog-http.constants.ts`. `products.controller.spec.ts` (`configureApp` + supertest + fake repository) checks:
   - the `{ data, meta }` envelope and the defaults 1/10;
   - 400 with `errors[]` for `page=0`, `limit=51` and `limit=abc`;
   - 400 for a non-uuid id and 404 `PRODUCT_NOT_FOUND`;
   - `Cache-Control: public, max-age=10` on the 200s and absent on the 400 and 404.

   Manual test:
   - `curl -i localhost:3000/api/v1/products?limit=2` returns 2 items, `meta.totalItems` 15, `totalPages` 8 and the cache header;
   - `curl -i localhost:3000/api/v1/products/abc` returns 400;
   - `/api/docs` shows both endpoints with their query and response schemas.

   Commit: `feat(api): expose GET /products and GET /products/:id`.

8. [ ] **Locations use cases.** `ListDepartmentsUseCase` and `ListMunicipalitiesUseCase`, with unit specs over a fake `MunicipalityRepository`. They cover the mapping to `{ code, name, isMetroArea }` and `DEPARTMENT_NOT_FOUND` on an empty list.
   Manual test: `test` green.
   Commit: `feat(api): add department and municipality use cases`.

9. [ ] **Locations endpoints.** `locations.controller.ts`, the locations request and response DTOs and `locations-http.constants.ts`. `locations.controller.spec.ts` checks:
   - both envelopes;
   - 400 for `:code` values `abc`, `5` and `123`;
   - 404 `DEPARTMENT_NOT_FOUND`;
   - `Cache-Control: public, max-age=86400` only on the 200s.

   Manual test:
   - `curl -i …/locations/departments` returns 33 departments sorted by name;
   - `…/departments/05/municipalities` includes Medellín with `isMetroArea: true`;
   - `…/departments/99/municipalities` returns 404 with no `Cache-Control`.

   Commit: `feat(api): expose department and municipality endpoints`.

### Close-out

10. [ ] **PR and green CI.** Run `pnpm --filter @checkout/api test:cov` and check in the coverage report that `modules/catalog` and `modules/locations` are each ≥ 80 % on all four metrics. Then push, open the PR with `gh-cli`, wait for CI and fix whatever fails. If web 02 merged first and touched the lockfile, apply the lockfile protocol. Finally, mark this spec `Implemented` and tick its criteria.
    Manual test: every check green.
    Commit: `docs: mark spec 04 as Implemented`.

Notes:

- If CI fails in step 10, the fix goes in its own `fix: …` commit, after review.
- If a frozen port or a `packages/shared` contract turns out to be wrong, stop and apply the contract-change protocol.
- Checkpoint C1 (web 02 against this API with `VITE_API_MOCKING=false`) runs after both PRs merge. It is not a step of this spec.

## Acceptance criteria

Products

- [ ] `GET /api/v1/products` without a query returns 200 with `{ data, meta }` at the top level, `meta = { page: 1, limit: 10, totalItems, totalPages }`, and at most 10 items.
- [ ] Every item has exactly the `ProductSummary` fields: `id, sku, name, brand, priceInCents, currency: "COP", imageUrl, stockAvailable`. It never includes `stockReserved`, `description` or timestamps.
- [ ] Items are ordered by `(created_at, id)`, and a soft-deleted product never appears (proven by the int-spec).
- [ ] `page=0`, `limit=0`, `limit=51` and `limit=abc` each return 400 `VALIDATION_ERROR` with an `errors[]` entry naming the field.
- [ ] A page past the end returns 200 with `data: []` and the real `totalItems` / `totalPages`.
- [ ] `GET /api/v1/products/:id` returns the `ProductSummary` fields plus `description`, `vatIncludedInCents` and `maxPurchaseQuantity`.
- [ ] For `HP-SNY-WH1000XM5` (price `189990000`, stock 7) the detail returns `vatIncludedInCents: 30334500` and `maxPurchaseQuantity: 7`.
- [ ] A product with stock 0 returns `maxPurchaseQuantity: 0`, and one with stock 25 returns `10`.
- [ ] A non-uuid-v4 id returns 400 with `errors[]` for `id`. An unknown or soft-deleted id returns 404 `PRODUCT_NOT_FOUND` as Problem Details.
- [ ] Both product endpoints send `Cache-Control: public, max-age=10` on 200 and no `public` cache header on 400 or 404.

Locations

- [ ] `GET /api/v1/locations/departments` returns every department once, as `{ code, name }`, sorted by name.
- [ ] `GET /api/v1/locations/departments/05/municipalities` returns `{ code, name, isMetroArea }` items sorted by name, and `05001` Medellín has `isMetroArea: true`.
- [ ] `:code` values `abc`, `5` and `123` return 400 `VALIDATION_ERROR`. A well-formed code with no municipalities (`99`) returns 404 `DEPARTMENT_NOT_FOUND`.
- [ ] Both location endpoints send `Cache-Control: public, max-age=86400` on 200 and no `public` cache header on 400 or 404.

Domain and exports

- [ ] `vatIncludedInCents(379_980_000) === 60_669_100` and `vatIncludedInCents(189_990_000) === 30_334_500`. The function uses no floating-point VAT rate.
- [ ] `haversineKm` for Medellín ↔ Bogotá is between 235 and 245 km.
- [ ] `findNearestWarehouse` returns `null` for an empty list, picks the first warehouse on a tie, and returns an integer `distanceKm`.
- [ ] `catalog/index.ts` exports `vatIncludedInCents` and `PRODUCT_REPOSITORY`.
- [ ] `locations/index.ts` exports `haversineKm`, `findNearestWarehouse`, `GeoPoint`, `NearestWarehouse`, `MUNICIPALITY_REPOSITORY` and `WAREHOUSE_REPOSITORY`.
- [ ] Each module provides and exports its repository tokens, so another module can inject them by importing `CatalogModule` / `LocationsModule`.

Persistence

- [ ] `TypeOrmProductRepository`, `TypeOrmMunicipalityRepository` and `TypeOrmWarehouseRepository` implement every method of their frozen ports, and each has an int-spec.
- [ ] Every repository int-spec runs inside a transaction that rolls back. Running `test:int` leaves the row counts of `products`, `municipalities` and `warehouses` unchanged.
- [ ] No raw SQL (`query(`, `manager.query`) exists under `modules/catalog` or `modules/locations`.

Swagger

- [ ] `/api/docs` shows the four endpoints with their query and path constraints (`page ≥ 1`, `limit` 1–50, uuid, 2-digit code) and their 200 response schemas.
- [ ] Every response DTO `implements` its `@checkout/shared/contracts` interface.

Quality and CI

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @checkout/api test:cov` and `pnpm --filter @checkout/api test:int` exit 0 locally.
- [ ] The coverage report shows `modules/catalog` and `modules/locations` each at ≥ 80 % on statements, branches, functions and lines, and `apps/api` stays at ≥ 80 % globally.
- [ ] The PR shows green `lint`, `typecheck`, `coverage (api)` and `api-integration`.
- [ ] `git diff main --stat` shows changes only under `apps/api/src/modules/catalog/`, `apps/api/src/modules/locations/`, `apps/api/src/shared/infrastructure/http/respond.ts` (+ its spec) and `specs/`.

## Decisions

Spec and branch

- **Yes:** SPEC 04 with branch `spec-04-api-catalog`, created by `/spec-impl`. SPEC 03 is `web-app-foundation`, and the web catalog is SPEC 05. This spec consolidates two drafts accidentally produced from the same phase file (`phases/saturday/api/02-catalog.md` run twice instead of once per area).
- **No:** `feat/02-api-catalog` from the phase file.

Money

- **Yes:** VAT rounded to the whole peso, as `Math.round(priceInCents × 19 / (119 × 100)) × 100`. `02-api-contracts.md` says calculations round to the whole peso, and the `/quotes` example (`60669100`) only reproduces this way, which api 03 must match exactly.
- **No:** cent rounding (`round(price − price / 1.19)`) as written in the phase file. It gives `60669076` and breaks the contract example — this was the exact discrepancy that surfaced when reconciling the two independent drafts of this spec, and it is why this version was kept over the other.
- **No:** a `1.19` float. Integer multiplication before division keeps the result exact for every safe-integer price.
- **Yes:** `vatIncludedInCents` lives in `catalog/domain` and is exported through `index.ts`, so pricing reuses it for the quote's subtotal instead of duplicating the formula.
- **Yes:** `maxPurchaseQuantity = min(stockAvailable, MAX_QUANTITY)` is kept even though every seeded product's stock currently fits under 10. `MAX_QUANTITY` mirrors the frozen `transactions.quantity CHECK (BETWEEN 1 AND 10)` (`01-data-model.md`) — a per-order limit, not a stock-driven one. Dropping the `min()` would let the product page offer a quantity the database will reject once a transaction is created, the moment any product's stock goes above 10 (which SPEC 02's seed intentionally does, to show the "normal stock" badge).

Pagination

- **Yes:** `respondPaginated()` next to `respond()` in `src/shared/infrastructure/http/`. The envelope logic stays in one place, and `src/shared` is not on the phase's "must not touch" list.
- **No:** a catalog-local helper. It would be a second envelope implementation.
- **Yes:** a page past the end returns 200 with `data: []` and the real `meta`, and `totalPages` is 0 on an empty catalog. An out-of-range page is not an error, and the web can render an empty state.
- **Yes:** `findAndCount` with `skip` / `take`. Fifteen products do not justify keyset pagination.
- **No:** keyset (cursor) pagination. The frozen contract is page-based.

Validation and errors

- **Yes:** a malformed department code (not 2 digits) returns 400 `VALIDATION_ERROR`, consistent with a non-uuid id. Only a well-formed but unknown code returns 404.
- **Yes:** path params validated with DTOs (`@IsUUID('4')`, `@Matches`) instead of `ParseUUIDPipe`. The 400 then carries `errors[]` like every other validation error.
- **Yes:** `DEPARTMENT_NOT_FOUND` when `listByDepartment` returns an empty list. The port reports the fact; the use case decides the error, as SPEC 02 set for every repository. Every DIVIPOLA department has at least one municipality, so "valid department, genuinely empty" cannot occur with real data.
- **No:** a separate "department exists" query. It adds a round trip for the same answer.
- **Yes:** `productNotFound()` in catalog has kind `NOT_FOUND`. Pricing builds its own 422 variant for `GET /quotes`, since the status depends on the use case, not on the code.

Caching

- **Yes:** `Cache-Control` only on 200 responses, set with `@Header()`. A public 404 cached for a day by CloudFront or the browser would outlive a data fix.
- **No:** the same header on every response, or an interceptor that also touches errors.
- **No:** a server-side cache. The data is small, the queries hit indexes, and the HTTP header is the only caching the contract asks for.

Distance

- **Yes:** `haversineKm` returns unrounded km. `findNearestWarehouse` rounds the winner's distance with `Math.round`, which is the single rounding point and matches `distance_km integer`.
- **Yes:** `findNearestWarehouse` returns `null` on an empty list, so the caller decides the error. The domain stays free of HTTP concerns.
- **Yes:** on a tie the first warehouse wins, and `listActive` orders by name so the result is deterministic.
- **Yes:** Earth radius 6371 km as a named constant in `locations.constants.ts`. `DEPARTMENT_CODE_PATTERN` is imported from `@checkout/shared/constants` instead, since SPEC 01 already froze it there.

Persistence

- **Yes:** repositories inject an `EntityManager`, and the int-specs build it from a `QueryRunner` inside a transaction that always rolls back. Products are publicly listed, so committed test rows would pollute the local catalog and checkpoint C1. This is a deliberate exception to `references/testing.md`'s general "insert with `randomUUID()`, never clean up" rule, following the same reasoning SPEC 02 already applied to its seed integration test.
- **No:** inserting and hard-deleting in `afterAll` (leaves rows behind when a test crashes), or accepting the pollution.
- **Yes:** every method of the three frozen ports is implemented now, including the ones only api 03 and 04.1 call. api 03 then consumes `locations` only through `index.ts` and never edits it.
- **Yes:** departments derived with `SELECT DISTINCT` over `municipalities`. §3 has no `departments` table, and adding one would change the frozen schema.
- **Yes:** sorting happens in the database (`ORDER BY name`), using the `idx_municipalities_department` index and the database collation.

Contract and Swagger

- **Yes:** response DTO classes that `implements` the shared contract interfaces. Drift between Swagger and the frozen contract fails `typecheck`.
- **Yes:** `imageUrl` returned as stored (`/images/products/<sku>-640.webp`). The API and the SPA share the CloudFront origin, and the web builds its `srcset` from the suffix.
- **No:** absolute URLs built from a new env var. There is no per-environment value to configure.
- **Yes:** use cases return views typed with `@checkout/shared/contracts` (`ProductSummary`, `ProductDetail`, `Paginated`), mapped by mechanical helpers (`toProductSummary`, `buildPaginationMeta`).

Testing

- **Yes:** controller specs through `configureApp()` + supertest with fake repositories and no database. They prove status codes, envelopes and headers against the real production pipeline, quickly.
- **No:** the full HTTP e2e suite against Postgres. It stays out of scope, as in SPEC 02.
- **Yes:** per-module coverage checked in the report at close-out, with `jest.config.ts` unchanged. That file belongs to SPEC 02.

## Risks

| Risk | Mitigation |
| --- | --- |
| The database collation sorts accented names wrongly (under `C`, "Ábrego" lands after "Zona Bananera"). | The municipality int-spec inserts `Abejorral`, `Ábrego` and `Zetaquira` under a test department code and expects that order. The docker image and RDS default to `en_US.UTF-8`. If the test fails, stop and report before adding an explicit `COLLATE`. |
| SPEC 02's final code uses different names than assumed here (`TypeOrmTxContext.manager`, `DomainErrorException`, `respond()` internals). | Adapt the names, not the shape. If a frozen port signature itself is wrong, stop and apply the contract-change protocol. |
| A repository query escapes the injected `EntityManager` (for example through the `DataSource`). The int-spec would then commit rows or miss uncommitted ones. | Repositories only use the injected manager or `tx.manager`. The row-count criterion catches any leak. |
| Nest's `@Header()` also ends up on error responses. | The controller specs assert its absence on 400 and 404. If it leaks, fall back to setting the header through `@Res({ passthrough: true })` on the success path only. |
| web 02's MSW mocks drift from the real responses. The contract example shows an absolute `imageUrl`, while the API returns the stored relative path. | Response DTOs `implements` the frozen contracts, and checkpoint C1 compares both. The relative `imageUrl` is called out in the PR description so web 02 does not mock an absolute URL. |
| `numeric(9,6)` coordinates reach the domain as strings and `haversineKm` returns `NaN`. | SPEC 02's `numeric → number` transformer, plus a municipality int-spec assertion that coordinates are `number`. |
| web 02 merges first and `pnpm-lock.yaml` conflicts. | Unlikely, since no new dependencies are planned. If it happens, apply the lockfile protocol: `git checkout main -- pnpm-lock.yaml && pnpm install`. |

## What is **not** in this spec

- `GET /quotes`, the base fee and the delivery-fee strategies (api 03).
- The `StockReservationPort` adapter and its raw SQL (api 04.1).
- Write endpoints for products, municipalities or warehouses.
- A server-side cache, or absolute image URLs.
- The HTTP e2e suite against Postgres in `apps/api/test`.
- Rate limiting (api 07) and product image files (web 02).
- Any change to `app.module.ts`, `packages/shared`, other modules, the frozen ports, the ORM entities, `jest.config.ts`, `docs/`, `references/`, `phases/` or the `CLAUDE.md` files.
- The web catalog (`phases/saturday/web/02-catalog.md`), which is SPEC 05.

Each of these, if it lands, goes in its own spec.
