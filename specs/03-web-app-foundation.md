# SPEC 03 — Web: app foundation, design system and layout

> **Status:** Approved
> **Depends on:** SPEC 01 (merged). Runs in parallel with SPEC 02 (api app foundation) in its own worktree.
> **Date:** 2026-09-26
> **Objective:** Stand up `apps/web` as a React + Vite + TypeScript app whose router, store, RTK Query base API, MSW mocks, Jest and lint boundaries are in place, and turn `apps/web/DESIGN.md` into code (tokens, fonts, shadcn primitives and the page shell), so feature phases only add features.

## Scope

**In:**

Part 1 — Vite tooling and app plumbing

- `apps/web/package.json` (`"type": "module"`) with scripts `dev`, `build`, `preview`, `typecheck`, `test` and `test:cov`.
- `tsconfig.json` (extends `tsconfig.base.json`, DOM lib, `jsx: react-jsx`, `@/*` path) and `tsconfig.node.json` for `vite.config.ts`.
- `vite.config.ts`: React plugin, `@/` alias to `src/`, `envDir` at the repo root, and a dev proxy from `/api` to `http://localhost:3000`. `@checkout/shared/*` resolves from TypeScript source through the package's subpath exports.
- `index.html` with `lang="es-CO"`.
- `src/config/env.ts`: the only reader of `import.meta.env`. It reads `VITE_API_BASE_URL`, `VITE_API_MOCKING`, `VITE_PAYMENT_GATEWAY_URL` and `VITE_PAYMENT_GATEWAY_PUBLIC_KEY`, validates them at startup and exports a typed `env` object.
- `src/main.tsx`: starts the MSW browser worker when `env.apiMocking` is true, then renders the app.
- `src/app/`:
  - `store.ts`: `configureStore` plus redux-persist (`localStorage`, key `soundhub`, `version: 1`, whitelist `checkout` and `customer`) and the RTK Query middleware.
  - `hooks.ts`: typed hooks.
  - `providers.tsx`: `Provider`, `PersistGate` and `RouterProvider`.
  - `router.tsx`: `createBrowserRouter` with a root layout route and `/`, `/products/:id`, `/transactions/:id`, `*` (NotFound), plus a dev-only `/__design`.
  - `placeholder-pages.tsx`.
- `src/features/checkout/{checkout.slice.ts,index.ts}` and `src/features/customer/{customer.slice.ts,index.ts}`: empty slices, registered in the store. This is the only exception to "do not touch `features/**`".
- `src/services/api.ts`: the RTK Query base API (`baseUrl` from `env.apiBaseUrl`, an `X-Request-Id` header per request, `tagTypes: ['Product', 'Quote', 'Customer']`, errors typed as `ProblemDetails` with an `isProblemDetails` guard).
- `src/mocks/`: typed fixtures and MSW handlers for every endpoint the SPA calls:
  - `GET /products` and `GET /products/:id`
  - departments and municipalities
  - `GET /quotes`
  - `POST /customers` and `GET /customers/:id`
  - `POST /transactions` and `GET /transactions/:id`
  - `GET /deliveries/:id`
  - `browser.ts` (worker) and `server.ts` (Jest).
  - `public/mockServiceWorker.js` is committed.
- `src/test/`: `setup.ts` (jest-dom, the MSW server lifecycle, and the `config/env.ts` mock) and `render-with-providers.tsx` (store with preloaded state, plus a memory router).
- `jest.config.js`: `@swc/jest`, `jest-fixed-jsdom`, CSS and asset mappers, an 80% threshold on all four metrics, and `json-summary` output. Coverage excludes `main.tsx`, `mocks/browser.ts`, `test/**` and unmodified shadcn primitives.
- `eslint.config.js`: extends the root config and adds `react-hooks`, `react-refresh`, and these boundaries:
  - W1: `components/ui` does not import `features`, `services` or `app`.
  - W2: a feature imports another feature only through its `index.ts`.
  - W4, approximated: `fetch`, `axios` and `XMLHttpRequest` are allowed only in `services/**` and `mocks/**`.
  - `import.meta.env` is allowed only in `config/**`.
- Chrome evidence in `docs/evidence/app-foundation/`.

Part 2 — design system and layout

- Tailwind v4 through `@tailwindcss/vite`.
- `src/styles/index.css`:
  - Every DESIGN.md §2 token in `@theme` (colors, radii, shadows, font families, breakpoints).
  - shadcn's semantic variables as aliases of those tokens (`--primary` → `ink`, `--ring` → `brand-sky`, `--destructive` → `danger`, …).
  - The global focus ring and `prefers-reduced-motion` handling.
- Fonts through `@fontsource`, with `font-display: swap` and the latin subset only: Manrope 700, and Open Sans 400, 600 and 700.
- `components.json`, `src/lib/cn.ts`, and `src/lib/money.ts` (`formatCop(cents)`).
- `src/components/ui/` added with the shadcn CLI: `button`, `input`, `label`, `select` (Radix), `checkbox`, `form`, `dialog`, `drawer`, `card`, `badge` and `skeleton`. They get the DESIGN.md variants and sizes (44 px inputs, 56 px primary button, pill radius).
- `src/components/layout/`: `test-mode-banner.tsx`, `header.tsx` (SoundHub wordmark linking to `/`), `page-container.tsx` (max 1040 px, 16/32 px padding), `trust-footer.tsx` and `app-shell.tsx`. The root layout route renders `AppShell` around `<Outlet />`.
- `lucide-react` for icons.
- `src/app/design-showcase-page.tsx`: the dev-only `/__design` page with every primitive and variant, lazy-loaded and left out of the production build.
- Chrome evidence in `docs/evidence/design-system/`.

Close-out

- Push, open the PR with `gh-cli`, get CI green (including `coverage (web)`), and mark this spec `Implemented`. If SPEC 02 merges first, regenerate `pnpm-lock.yaml` by the lockfile protocol before the last step.

**Out of scope (for future specs):**

- Real pages, feature endpoints (`*.api.ts`) and slice actions (web 02 onwards).
- `services/payment-gateway.ts`, and MSW handlers for the gateway's `/merchants` and `/tokens/cards` (web 03/04).
- MSW handlers for `POST /webhooks/payments` and `GET /health`. The SPA never calls them.
- Stateful MSW scenarios, such as a PENDING → APPROVED sequence. Tests override handlers with `server.use(...)`.
- The `Transaction` and `Delivery` tags. The feature that needs one adds it with `enhanceEndpoints({ addTagTypes })`.
- Product images (web 02).
- Playwright and enabling the `e2e` CI job (web 08).
- CSP and security headers (infra).
- Dark mode (DESIGN.md §10), Storybook and TanStack Query.
- Any change to `packages/shared`, which goes through the contract-change protocol.
- Any change to `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

## Data model

This spec creates no database tables and does not change `packages/shared`. Every API shape comes from `@checkout/shared/contracts`. It introduces the client-side structures below.

### `src/config/env.ts`

```ts
export interface Env {
  apiBaseUrl: string;              // VITE_API_BASE_URL, e.g. "/api/v1"
  apiMocking: boolean;             // VITE_API_MOCKING, only "true" | "false"
  paymentGatewayUrl: string;       // VITE_PAYMENT_GATEWAY_URL
  paymentGatewayPublicKey: string; // VITE_PAYMENT_GATEWAY_PUBLIC_KEY
  isDev: boolean;                  // import.meta.env.DEV
}
export const env: Env;
```

A missing or empty variable, or an `apiMocking` value other than `"true"`/`"false"`, throws at startup with the variable's name. The validation lives in a pure `parseEnv(source)` in `src/config/parse-env.ts`; `env.ts` is one line, `parseEnv(import.meta.env)`. In Jest, `setup.ts` mocks `env.ts` with fixed values, and `apiBaseUrl` is absolute (`http://localhost/api/v1`).

### Store (`src/app/store.ts`)

```ts
type CheckoutState = Record<string, never>;  // filled by web 02/03
type CustomerState = Record<string, never>;  // filled by web 03

interface RootState {
  [api.reducerPath]: ...;       // RTK Query cache, never persisted
  checkout: CheckoutState;
  customer: CustomerState;
  _persist: PersistState;
}

const persistConfig = { key: 'soundhub', version: 1, storage /* localStorage */, whitelist: ['checkout', 'customer'] };

export function makeStore(preloadedState?: Partial<RootState>): AppStore; // tests build a fresh store, without a persistor
export const store: AppStore;
export const persistor: Persistor;
```

The serializable check ignores redux-persist's actions (`FLUSH`, `REHYDRATE`, `PAUSE`, `PERSIST`, `PURGE`, `REGISTER`).

### Base API (`src/services/api.ts`)

```ts
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: env.apiBaseUrl,
    prepareHeaders: (headers) => headers.set(REQUEST_ID_HEADER, crypto.randomUUID()),
  }),
  tagTypes: ['Product', 'Quote', 'Customer'],
  endpoints: () => ({}),
});

export function isProblemDetails(error: unknown): error is { status: number; data: ProblemDetails };
export function getErrorCode(error: unknown): ErrorCode | null; // what the UI switches on (DESIGN.md §6)
```

Conventions for the endpoints the features inject:

- A single resource unwraps the `ApiResponse<T>` envelope with `transformResponse: (r: ApiResponse<T>) => r.data`.
- A paginated list keeps `{ data, meta }` whole.
- A new tag type is added in the feature with `api.enhanceEndpoints({ addTagTypes: [...] })`, never by editing `api.ts`.

### Routes (`src/app/router.tsx`)

| Path | Element in this spec | Replaced by |
|---|---|---|
| `/` | `CatalogPlaceholderPage` | web 02: `CatalogPage` from `@/features/catalog` |
| `/products/:id` | `ProductPlaceholderPage` | web 02: `ProductPage` from `@/features/catalog` |
| `/transactions/:id` | `TransactionPlaceholderPage` | web 04: `TransactionStatusPage` from `@/features/transaction` |
| `*` | `NotFoundPage` | stays |
| `/__design` (only when `env.isDev`) | `DesignShowcasePage`, lazy | stays |

Every route is a child of one root layout route that renders `<AppShell><Outlet /></AppShell>`. A feature phase changes one import line and one `element`, never the tree.

### MSW (`src/mocks/`)

```
mocks/
├─ fixtures/  products.ts · locations.ts · quote.ts · customer.ts · transaction.ts · delivery.ts
├─ handlers/  catalog.handlers.ts · locations.handlers.ts · quotes.handlers.ts · customers.handlers.ts · transactions.handlers.ts · deliveries.handlers.ts · index.ts
├─ problem.ts   problem(status, code, detail) → ProblemDetails
├─ browser.ts   setupWorker(...handlers)
└─ server.ts    setupServer(...handlers)
```

- **Products:** 12 `ProductDetail` records.
  - SKUs follow `HP-<BRAND>-<MODEL>` and every price is a multiple of 100 cents.
  - Exactly one product has `stockAvailable: 0`.
  - `imageUrl` is `/images/products/<sku>-640.webp`; the files arrive in web 02.
  - `GET /products` honors `page` and `limit` by slicing the fixture array.
  - An unknown id returns 404 `PRODUCT_NOT_FOUND`.
- **Locations:**
  - Antioquia `05`: Medellín `05001` and Envigado `05266` (metro), and Rionegro `05615`.
  - Bogotá D.C. `11`: Bogotá `11001`.
  - Valle del Cauca `76`: Cali `76001`.
  - An unknown department returns 404 `DEPARTMENT_NOT_FOUND`.
- **Quote:** the contract's example (2 × WH-1000XM5 to Medellín, total `392046000`), static. It echoes no arithmetic.
- **Customers:**
  - `POST` echoes the body with a fixed `id` (201).
  - `GET` returns the fixture customer.
  - An unknown id returns 404 `CUSTOMER_NOT_FOUND`.
- **Transactions:**
  - `POST` returns 201, `PENDING`, with a `Location` header.
  - `GET` returns `APPROVED` with `card: { brand: 'VISA', last4: '4242' }`.
- **Delivery:** `GET` returns `READY_TO_SHIP`.
- **Typing and URLs:** every handler is typed with the contract types. Paths use the pattern `*/api/v1/...`, so they match both the relative dev URL and Jest's absolute URL.

### Test helper (`src/test/render-with-providers.tsx`)

```ts
interface RenderWithProvidersOptions {
  preloadedState?: Partial<RootState>;
  route?: string;            // initial URL, default "/"
}
renderWithProviders(ui: ReactElement, options?: RenderWithProvidersOptions)
  → RenderResult & { store: AppStore; user: UserEvent }
```

### Money (`src/lib/money.ts`)

```ts
formatCop(cents: Cents): string   // 18999000 → "$ 189.990"
```

It uses `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })` on `cents / 100`. The output contains a non-breaking space after `$`; tests compare against the formatter's own output or normalize ` `.

### Design tokens (`src/styles/index.css`)

| DESIGN.md token | CSS variable | Utility |
|---|---|---|
| Colors (`ink`, `brand-lime`, `brand-mint`, `brand-forest`, `brand-sky`, `paper`, `canvas`, `surface`, `surface-tint`, `text-strong`, `text`, `border`, `border-subtle`, `selected-bg`, `selected-border`, `danger`, `warning`) | `--color-<token>` | `bg-ink`, `text-brand-forest`, … |
| Radii: input 6 · card 16 · panel 20 · pill | `--radius-input`, `--radius-card`, `--radius-panel` | `rounded-input`, `rounded-card`, `rounded-panel`, `rounded-full` |
| Shadows: card, overlay | `--shadow-card`, `--shadow-overlay` | `shadow-card`, `shadow-overlay` |
| Fonts: Manrope, Open Sans, mono stack | `--font-heading`, `--font-body`, `--font-mono` | `font-heading`, … |
| Breakpoints: `sm` 640 · `md` 768 · `lg` 1024 | `--breakpoint-*` | `sm:`, `md:`, `lg:` |
| Max content width 1040 px | `--container-content` | `max-w-content` |

shadcn's semantic variables are aliases, not new colors:

| shadcn variable | Points to |
|---|---|
| `--background` | `canvas` |
| `--foreground` | `ink` |
| `--card` | `surface` |
| `--primary` / `--primary-foreground` | `ink` / `brand-lime` |
| `--secondary` | `surface` |
| `--muted` / `--muted-foreground` | `paper` / `text` |
| `--input` | `border` |
| `--ring` | `brand-sky` |
| `--destructive` | `danger` |

`--border` and `--color-border` are the same `#CACACA`.

### Primitive variants

| Component | Variants | Sizes |
|---|---|---|
| `Button` | `primary` (ink + lime, pill, default) · `secondary` (surface + border, pill) · `ghost` · `link` (forest, underlined) | `default` 56 px · `compact` 44 px · `icon` 44×44 |
| `Badge` | `success` (mint + ink) · `danger` (danger + white) · `neutral` | — |
| `Input`, `Select` trigger | — | 44 px, 16 px text, `rounded-input` |
| `Card` | `default` (radius 16, `shadow-card`) | — |
| `Dialog`, `Drawer` | — | `rounded-panel`, `shadow-overlay` |

## Implementation plan

Prerequisites (not commits):

- From the main checkout, run `pnpm worktree:new spec-03-web-app-foundation`. It creates `../hc-spec-03-web-app-foundation` with the `.env` symlink and dependencies installed.
- `/spec-impl` runs inside that worktree. The branch already exists, so it only switches to it.
- Port 5173 is used by this session only (SPEC 02 uses 3000).

Each step is one commit after review.

- Target: ≤ ~300 changed lines per step, excluding the lockfile and `public/mockServiceWorker.js`.
- Steps that render UI are checked in Chrome at 375×667 and 1440×900 before the step summary.
- Screenshots are named `docs/evidence/<folder>/<nn>-<screen>-<viewport>.png`.
- Tests are written with the `react-test-suite-writer` agent.

### Part 1 — Vite tooling and app plumbing

1. **Vite skeleton.**
   - `package.json` (`"type": "module"`, scripts `dev`, `build`, `preview`, `typecheck`).
   - React 19, Vite and `@vitejs/plugin-react`.
   - `tsconfig.json`, `tsconfig.node.json`, and `vite.config.ts` (`@/` alias, root `envDir`, `/api` proxy to `http://localhost:3000`).
   - `index.html` (`lang="es-CO"`), and a `src/main.tsx` that renders the text "SoundHub".

   Manual test: `pnpm --filter @checkout/web dev` shows the text on `:5173`. `build`, `pnpm typecheck` and `pnpm lint` pass.
   Commit: `chore(web): scaffold Vite React TypeScript app`.

2. **Jest and typed config.**
   - `jest.config.js` (`@swc/jest`, `jest-fixed-jsdom`, CSS and asset mappers, 80% threshold, `json-summary`).
   - `src/test/setup.ts` (jest-dom and the `config/env` mock).
   - `src/config/parse-env.ts`: a pure `parseEnv(source)` with the validation rules, and unit tests for each rule.
   - `src/config/env.ts`: one line, `parseEnv(import.meta.env)`, excluded from coverage.
   - Scripts `test` and `test:cov`.

   Manual test: `pnpm --filter @checkout/web test:cov` passes the threshold. A missing `VITE_API_BASE_URL` makes the dev server fail with that variable's name.
   Commit: `test(web): set up Jest and typed env config`.

3. **Web ESLint boundaries.**
   - `apps/web/eslint.config.js` extends the root config.
   - It adds `react-hooks` and `react-refresh`.
   - It adds W1, W2, W4 (approximated) and the `import.meta.env` restriction. Test files may use `fetch`.

   Manual test: `pnpm lint` passes. Four throwaway files, each violating one of those rules, fail with its message and are then deleted:
   - `components/ui` importing `features`;
   - one feature doing a deep import into another;
   - `fetch` inside a feature;
   - `import.meta.env` outside `config/`.

   Commit: `chore(web): enforce layer boundaries with ESLint`.

4. **Store and persisted slices.**
   - `app/store.ts` (`makeStore`, redux-persist `soundhub` v1, whitelist) and `app/hooks.ts`.
   - `features/checkout/{checkout.slice.ts,index.ts}` and `features/customer/{customer.slice.ts,index.ts}` with empty state.
   - `app/providers.tsx` with `Provider` and `PersistGate`.

   Manual test: tests prove the whitelist persists `checkout` and `customer` and never `api`. In Chrome, `localStorage` shows the `persist:soundhub` key.
   Commit: `feat(web): add Redux store with persisted checkout and customer slices`.

5. **Router, placeholder pages and test helper.**
   - `app/router.tsx`: the root layout route with `<Outlet />`, the three routes and `*`.
   - `app/placeholder-pages.tsx` (including `NotFoundPage`), and `RouterProvider` in `providers.tsx`.
   - `test/render-with-providers.tsx`.

   Manual test: tests render each route and NotFound through `renderWithProviders`. In Chrome, `/`, `/products/abc`, `/transactions/abc` and `/nope` show their placeholder. Evidence goes to `docs/evidence/app-foundation/`.
   Commit: `feat(web): add router with placeholder routes`.

6. **Base API.**
   - `msw` as a dev dependency, and `mocks/server.ts` with no handlers yet.
   - The MSW server lifecycle in `setup.ts` (`onUnhandledRequest: 'error'`).
   - `services/api.ts` with `isProblemDetails` and `getErrorCode`, and the `api` reducer and middleware added to the store.

   Manual test: tests with an injected test endpoint and `server.use(...)` prove that each request carries a UUID `X-Request-Id`, and that a 409 `application/problem+json` response comes back typed with `getErrorCode(...) === 'OUT_OF_STOCK'`.
   Commit: `feat(web): add RTK Query base API with typed problem details`.

7. **MSW fixtures and read handlers.** `mocks/problem.ts` plus fixtures and handlers for products (list with pagination, and detail), locations and quotes.

   Manual test: tests call each handler with `fetch`. They check page 2 with limit 10 → 2 items and `totalPages: 2`, an unknown product → 404 `PRODUCT_NOT_FOUND`, an unknown department → 404, and a quote total of `392046000`.
   Commit: `feat(web): add MSW fixtures and handlers for catalog, locations and quotes`.

8. **MSW write and status handlers.** Fixtures and handlers for customers, transactions and deliveries.

   Manual test: tests check `POST /customers` → 201 with an `id`, `POST /transactions` → 201 `PENDING` with a `Location` header, `GET /transactions/:id` → `APPROVED`, and an unknown customer → 404 `CUSTOMER_NOT_FOUND`.
   Commit: `feat(web): add MSW handlers for customers, transactions and deliveries`.

9. **MSW in the browser.**
   - `mocks/browser.ts`, and `public/mockServiceWorker.js` generated with `msw init`.
   - `main.tsx` starts the worker only when `env.apiMocking` is true, before rendering.
   - A temporary `useGetProductsQuery` call in `CatalogPlaceholderPage` shows "12 products (mock)". It is an endpoint injected in `app/`, and web 02 removes it.

   Manual test: with `VITE_API_MOCKING=true`, the Network tab shows `GET /api/v1/products` served by the Service Worker, and the console shows `[MSW] Mocking enabled`. With `false`, the request goes to the proxy. Evidence goes to `docs/evidence/app-foundation/`.
   Commit: `feat(web): enable MSW in dev when mocking is on`.

### Part 2 — design system and layout

10. **Tokens and fonts.**
    - `@tailwindcss/vite`.
    - `styles/index.css`: `@theme` with every DESIGN.md §2 token, the shadcn alias variables, the global focus ring and `prefers-reduced-motion`.
    - `@fontsource/manrope` (700) and `@fontsource/open-sans` (400/600/700), latin only.
    - Placeholder pages use `bg-canvas`, `font-heading` and `text-text-strong`.

    Manual test: in Chrome, the computed `font-family` of the title is Manrope and of the body is Open Sans. The Network tab shows only local font requests. `grep -rE "#[0-9A-Fa-f]{3,6}" src --include=*.tsx` returns nothing.
    Commit: `feat(web): add design tokens and self-hosted fonts`.

11. **shadcn setup and helpers.** `components.json` (aliases `@/components/ui` and `@/lib/cn`), `lib/cn.ts`, and `lib/money.ts` (`formatCop`), with tests.

    Manual test: tests cover `formatCop(18999000)` → `"$ 189.990"`, `formatCop(0)` and `formatCop(392046000)` → `"$ 3.920.460"`.
    Commit: `feat(web): add shadcn config, cn and formatCop helpers`.

12. **Button, Badge, Card and the showcase.**
    - `button`, `badge` and `card` through the shadcn CLI, adjusted to the variants in the Data model.
    - `app/design-showcase-page.tsx` registered lazily at `/__design` only when `env.isDev`.

    Manual test: tests cover each `Button` variant and size by role and name, and a disabled button that is not clickable. The showcase is visible in Chrome. The lime-on-ink contrast is measured with DevTools (≥ 7:1). Evidence goes to `docs/evidence/design-system/`.
    Commit: `feat(web): add Button, Badge and Card primitives with a dev showcase`.

13. **Form primitives.**
    - `input`, `label`, `select` (Radix), `checkbox` and `form` through the CLI, with 44 px height, 16 px text and `rounded-input`.
    - `react-hook-form` and `@hookform/resolvers` ≥ 5.1.
    - The showcase gets a sample form validated with `customerSchema` from `@checkout/shared/validation`.

    Manual test: in the showcase, submitting empty shows the Spanish messages below each field in `danger`, linked with `aria-describedby`. Tab focus shows the `brand-sky` ring. Evidence goes to `docs/evidence/design-system/`.
    Commit: `feat(web): add form primitives`.

14. **Dialog, Drawer and Skeleton.** `dialog`, `drawer` (vaul) and `skeleton` through the CLI, with `rounded-panel` and `shadow-overlay`. The showcase gets buttons that open each one and a skeleton sample.

    Manual test: in Chrome, Esc closes both, and focus stays inside while they are open. With "Emulate prefers-reduced-motion" on, there is no animation. Evidence goes to `docs/evidence/design-system/`.
    Commit: `feat(web): add Dialog, Drawer and Skeleton primitives`.

15. **Page shell.**
    - `components/layout/{test-mode-banner,header,page-container,trust-footer,app-shell}.tsx`.
    - The root layout route renders `AppShell` around `<Outlet />`.

    Manual test: tests find "MODO DE PRUEBAS", the "SoundHub" link to `/`, the page content and "Pago seguro". Chrome evidence of the shell and the showcase goes to `docs/evidence/design-system/`. At 320 px width, `document.documentElement.scrollWidth <= 320`.
    Commit: `feat(web): add page shell with test-mode banner, header and trust footer`.

### Close-out

16. **PR and green CI.**
    - If SPEC 02 already merged, rebase on `main` and regenerate `pnpm-lock.yaml` with the lockfile protocol.
    - Push and open the PR against `main` with `gh-cli`, with links to the evidence.
    - Wait for CI and fix whatever fails.
    - Mark this spec `Implemented` and tick its criteria.

    Manual test: every PR check is green, and the `coverage (web)` summary shows a table with ≥ 80%.
    Commit: `docs: mark spec 03 as Implemented`.

Notes:

- If CI fails in step 16, the fix goes in its own `fix(web): …` commit, after review, before the `docs:` commit.
- If a shadcn CLI component does not support Tailwind v4 or React 19 as it is installed, stop and show the error before patching it by hand.
- If an MSW fixture needs a field the contract does not have, apply the contract-change protocol. Never edit `packages/shared` from this branch.

## Acceptance criteria

Tooling

- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test` exits 0 from the repo root.
- [ ] `pnpm --filter @checkout/web build` finishes without errors, and `dist/` contains no `mockServiceWorker.js` reference in the JS bundle when `VITE_API_MOCKING=false`.
- [ ] `pnpm --filter @checkout/web test:cov` passes with ≥ 80% statements, branches, functions and lines, and writes `coverage/coverage-summary.json`.
- [ ] `grep -rn "import.meta.env" apps/web/src` only matches files under `src/config/`.
- [ ] Starting the dev server without `VITE_API_BASE_URL` fails with a message naming that variable.
- [ ] A throwaway file (not committed) makes `pnpm lint` fail on each of:
  - `components/ui` importing from `features/`, `services/` or `app/`;
  - a deep import into another feature (`features/a` → `features/b/components/x`);
  - `fetch(...)` inside `features/`;
  - `import.meta.env` outside `config/`.
- [ ] Importing another feature through its `index.ts` does not fail lint.

App plumbing

- [ ] `pnpm --filter @checkout/web dev` serves `/`, `/products/abc`, `/transactions/abc` and an unknown path. Each renders its placeholder, and the unknown path renders `NotFoundPage`.
- [ ] `/__design` renders the showcase in dev and does not exist in the production build.
- [ ] `/api/*` requests in dev are proxied to `http://localhost:3000` when `VITE_API_MOCKING=false`.
- [ ] With `VITE_API_MOCKING=true`, the Network tab shows `GET /api/v1/products` answered by the Service Worker with the 12 fixture products.
- [ ] Every API request carries an `X-Request-Id` header with a UUID v4 (test).
- [ ] A 409 `OUT_OF_STOCK` Problem Details response makes `getErrorCode(error)` return `'OUT_OF_STOCK'`; a network error makes it return `null` (test).
- [ ] After a reload, `localStorage['persist:soundhub']` contains `checkout` and `customer` and does not contain `api` (test + Chrome).
- [ ] `services/api.ts` declares exactly `tagTypes: ['Product', 'Quote', 'Customer']`.
- [ ] `app/router.tsx` has a single root layout route. Each feature route is one `element` whose import can be swapped without changing the tree.

MSW

- [ ] There is one handler per endpoint listed in Scope, and none for `/webhooks/payments`, `/health`, `/merchants` or `/tokens/cards`.
- [ ] Every handler is typed with `@checkout/shared/contracts`, and `pnpm typecheck` fails if a fixture drops a required field.
- [ ] `GET /products?page=2&limit=10` returns 2 items and `meta.totalPages: 2`. An unknown product id returns 404 `PRODUCT_NOT_FOUND` in Problem Details format (test).
- [ ] An unhandled request in Jest fails the test (`onUnhandledRequest: 'error'`).

Design system

- [ ] Every DESIGN.md §2 color exists as a `--color-*` token, and `grep -rE "#[0-9A-Fa-f]{3,8}\b" apps/web/src --include=*.tsx` returns nothing.
- [ ] Only Manrope 700 and Open Sans 400/600/700 font files are loaded, all from the app's own origin (Network tab), with `font-display: swap`.
- [ ] `formatCop(18999000)` returns `"$ 189.990"` (with ` ` after `$`), and `formatCop(392046000)` returns `"$ 3.920.460"` (test).
- [ ] `Button`:
  - supports `primary`, `secondary`, `ghost` and `link`;
  - `primary` is `ink` with a `brand-lime` label and a pill shape;
  - the lime-on-ink contrast measured in DevTools is ≥ 7:1.
- [ ] `Input`, `Select`, `Checkbox`, `Form`, `Dialog`, `Drawer`, `Card`, `Badge` and `Skeleton` exist in `src/components/ui/` and render in the showcase.
- [ ] In the showcase form, submitting empty shows each field's `customerSchema` message below it. Each error is linked to its input with `aria-describedby`.
- [ ] Keyboard focus on any interactive element shows a 2 px `brand-sky` ring with a 2 px offset.
- [ ] Every button, input and select in the showcase is ≥ 44 px tall.
- [ ] With `prefers-reduced-motion: reduce` emulated, Dialog and Drawer open without transition.
- [ ] Dialog and Drawer close with Esc and trap focus while open.

Layout

- [ ] Every route shows:
  - the striped test-mode band with a "MODO DE PRUEBAS" badge;
  - the header with the "SoundHub" wordmark linking to `/`;
  - content capped at 1040 px, with 16 px padding (base) and 32 px (≥ `md`);
  - the trust footer with a shield icon and "Pago seguro".
- [ ] At 320 px width, no route or showcase section scrolls horizontally (`scrollWidth <= 320`).
- [ ] Tests cover the shell's rendering (banner, header link, footer text).

Evidence

- [ ] `docs/evidence/app-foundation/` holds placeholder routes at 375×667 and 1440×900, and a Network tab screenshot with MSW responses.
- [ ] `docs/evidence/design-system/` holds the shell and the showcase at 375×667 and 1440×900.

CI and PR

- [ ] The PR shows green checks for `lint`, `typecheck`, `coverage (shared)`, `coverage (api)`, `coverage (web)` and `api-integration`.
- [ ] The `coverage (web)` job summary shows a percentage table (not "no coverage yet") with ≥ 80% in all four metrics.
- [ ] `git diff main --stat` shows no change under `packages/shared/`, `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

Non-negotiables

- [ ] A case-insensitive search for the payment provider's brand name in the branch diff returns no match.
- [ ] The branch diff contains no `.env`, key, secret or `coverage/` output.

## Decisions

Spec and branch

- **Yes:** one spec for both parts (tooling + design system), one PR. It follows SPEC 01's precedent; the parts are reviewed commit by commit.
- **Yes:** number `03` and branch `spec-03-web-app-foundation`, in a worktree created with `pnpm worktree:new`. SPEC 02 (api) is being specified at the same time in `main`.
- **No:** branch `feat/01-web-app-foundation` from the phase file. Same convention as SPEC 00 and 01.

Server state and routing

- **Yes:** RTK Query for all server state. `apps/web/CLAUDE.md`, `layering.md` (W3/W4), the folder structure and the phase already name it. It covers loading and error states, caching, tag invalidation and polling.
- **No:** TanStack Query. It solves the same problem as RTK Query, and adding it next to Redux (required for the persisted slices) means two server caches, two providers, and rewriting approved docs. It adds no capability this project needs.
- **Yes:** `react-router` v7 in data mode (`createBrowserRouter`), with no `loader`s. Data still comes from RTK Query hooks (W4).
- **No:** framework mode or SSR. The app is a static SPA served from S3/CloudFront.
- **Yes:** placeholder pages in `src/app/placeholder-pages.tsx` and a fixed route table. Each feature phase swaps one import line.
- **No:** lazy imports from `@/features/<x>` now. They break while the feature does not exist.

Store

- **Yes:** the `checkout` and `customer` slice files are created in their final place, `features/<x>/<x>.slice.ts` plus `index.ts`. This is a documented exception to "do not touch `features/**`", so that `store.ts` never changes again.
- **No:** temporary slices in `app/` that later phases move. That would force every later phase to edit `store.ts`.
- **Yes:** redux-persist on `localStorage`, key `soundhub`, `version: 1`. The remembered customer must survive closing the tab, and the version allows a later migration.
- **No:** `sessionStorage`. It loses the remembered customer.
- **Yes:** `makeStore(preloadedState?)`, so each test gets a fresh store without a persistor.

Base API

- **Yes:** `tagTypes: ['Product', 'Quote', 'Customer']`, the three with a concrete use:
  - `Product` gets fresh stock after paying.
  - `Quote` re-quotes after `PRICE_CHANGED`.
  - `Customer` refreshes after the upsert.
  - `Product` is invalidated from `checkout` but provided by `catalog`, so its name lives in one central place.
- **No:** declaring `Transaction` and `Delivery` now. No client mutation changes them, polling keeps the transaction fresh, and declaring them would be speculative code.
- **Yes:** a feature that needs a new tag adds it with `api.enhanceEndpoints({ addTagTypes })`, never by editing `api.ts`.
- **No:** an empty `tagTypes` with every feature adding its own tags. `checkout` would have to redeclare `'Product'`, and a typo would compile and fail silently.
- **No:** `refetchOnMountOrArgChange` instead of tags. It fixes the stock but not the re-quote, and makes more requests than needed.
- **Yes:** endpoints unwrap `{ data }` with `transformResponse`, and paginated lists keep `{ data, meta }`.
- **No:** unwrapping the envelope in the base query. That would drop the pagination `meta`.
- **Yes:** `X-Request-Id` is generated per request with `crypto.randomUUID()`, using the `REQUEST_ID_HEADER` constant from `shared`.

Config

- **Yes:** `env.ts` reads the four `VITE_*` variables in `.env.example`, including `VITE_API_BASE_URL`. SPEC 01 froze that file, and a variable nobody reads would be misleading.
- **No:** a hard-coded `API_BASE_PATH` constant.
- **Yes:** validation lives in a pure `parse-env.ts`, tested. `env.ts` is one line, excluded from coverage, because Jest cannot parse `import.meta.env`.
- **Yes:** `envDir` at the repo root, as SPEC 01 anticipated in its risks.

Mocks

- **Yes:** MSW handlers only for the endpoints the SPA calls.
- **No:** handlers for the webhook and `health`, which the SPA never calls.
- **No:** handlers for the gateway calls here. They arrive with `services/payment-gateway.ts` in web 03/04.
- **Yes:** static fixtures, with tests overriding them through `server.use(...)`. That is simple and predictable.
- **No:** stateful scenarios (PENDING → APPROVED) now. The phase that needs them adds them.
- **Yes:** a static quote fixture taken from the contract example. Neither the web nor its mocks compute money.
- **Yes:** handler paths use the pattern `*/api/v1/...`, and Jest's `apiBaseUrl` is absolute, because `fetchBaseQuery` in Node rejects relative URLs.
- **Yes:** `public/mockServiceWorker.js` is committed. MSW needs it in `public/`, and every clone should run mocked without an extra step.
- **Yes:** a temporary endpoint in `CatalogPlaceholderPage`, so the mocked Network request can be shown in step 9. web 02 removes it.

Testing and lint

- **Yes:** `@swc/jest`, consistent with `packages/shared`. Type checking stays in `pnpm typecheck`.
- **No:** `ts-jest`.
- **Yes:** `jest-fixed-jsdom`, because MSW v2 needs `fetch`, `TextEncoder` and streams, which plain jsdom removes.
- **Yes:** `jest.config.js` instead of the phase's `jest.config.ts`. A TypeScript config in an ESM package needs `ts-node`.
- **Yes:** `tsconfig.node.json` next to `tsconfig.json`, so `vite.config.ts` gets Node types without leaking them into `src/`.
- **Yes:** W1, W2, the `import.meta.env` restriction and an approximation of W4 are enforced by lint. W4 is approximated by banning `fetch`, `axios` and `XMLHttpRequest` outside `services/`, `mocks/` and tests.
- **No:** a lint rule for W3 (server data copied into slices). It cannot be detected reliably, so it stays in review.
- **Yes:** `apps/web/eslint.config.js` extends the root config. ESLint 10 looks up the config next to each file, so this one must include the root rules.

Design system

- **Yes:** DESIGN.md tokens in `@theme`, and shadcn's semantic variables as aliases of them. Components added by the CLI then work without edits, and customized ones use the DESIGN.md names.
- **No:** rewriting every primitive to drop shadcn's variables. Every future `shadcn add` would need manual rework.
- **Yes:** the Radix `Select`, as DESIGN.md §5 says.
- **No:** `native-select`. It is better on mobile for long lists, but it departs from the approved design. If web 03 finds the Radix select awkward for municipalities, it can be revisited there.
- **Yes:** static `@fontsource` weights, latin subset: Manrope 700, and Open Sans 400/600/700, the only weights DESIGN.md uses.
- **No:** variable fonts or Google Fonts. The CSP stays `font-src 'self'`.
- **Yes:** a dev-only `/__design` showcase, lazy and left out of the production build. It gives reproducible evidence at no extra cost.
- **No:** Storybook. It is too heavy for this time budget.
- **No:** an uncommitted temporary page. The evidence could not be reproduced.
- **Yes:** `formatCop(cents)` takes cents, because every contract field is `*InCents`, so the division by 100 lives in one place.
- **No:** `formatCop(pesos)`.
- **Yes:** `label` added to the primitives, because shadcn's `form` depends on it.
- **Yes:** the test-mode banner is always visible, with no flag. The project is sandbox only.
- **Yes:** the "SoundHub" wordmark is Manrope text, with no image asset.

## Risks

| Risk | Mitigation |
| --- | --- |
| SPEC 02 and this spec both add dependencies, so `pnpm-lock.yaml` conflicts on the second merge. | Lockfile protocol in step 16: rebase, `git checkout main -- pnpm-lock.yaml && pnpm install`, rerun the checks. Never merge the lockfile by hand. |
| The shadcn CLI generates components for a Tailwind or React version different from the one installed, or rewrites `index.css` over our tokens. | Run the CLI with `components.json` already configured and review each diff before the commit. If a component breaks, stop and show the error before patching it by hand. |
| shadcn's `--color-border` (`var(--border)`) clashes with the DESIGN.md `border` token. | One definition: `--border` = `#CACACA` and `--color-border: var(--border)`. A test or grep confirms that `border-border` resolves to `#CACACA`. |
| MSW v2 in Jest fails with `ReferenceError: TextEncoder is not defined` or `Response is not defined`. | Use `jest-fixed-jsdom` as the environment. If it persists, add the polyfills in `setup.ts` and record it in the step summary. |
| `fetchBaseQuery` in Node throws `TypeError: Failed to parse URL` with a relative `baseUrl`. | The `env` mock in Jest uses `http://localhost/api/v1`, and the handlers use `*/api/v1/...`. |
| ESM-only packages (`msw`, `@mswjs/*`, `until-async`) fail under Jest with `SyntaxError: Cannot use import statement outside a module`. | `transformIgnorePatterns` lets `@swc/jest` transform those packages. |
| `@checkout/shared` from TypeScript source is not transformed by Jest or Vite (it lives under `node_modules` through the workspace link). | `moduleNameMapper` for `@checkout/shared/(.*)` → `packages/shared/src/$1` in Jest. Vite already compiles TypeScript from linked workspaces. Verified in step 2 with a test that imports `customerSchema`. |
| ESLint 10 looks up the config per file and ignores the root rules for `apps/web/**` if the local config does not include them. | `apps/web/eslint.config.js` imports and spreads the root config. Step 3 confirms that `console.log` in `apps/web/src` still fails. |
| `formatCop` prints ` ` after `$`, and a test with a normal space fails intermittently depending on the ICU version (Node 22 in CI vs 26 locally). | Tests compare with ` ` made explicit, or normalize whitespace. CI on Node 22 is the reference. |
| The MSW Service Worker stays registered in the browser after turning mocking off, and serves stale responses. | `main.tsx` only registers the worker when `apiMocking` is true. Checkpoint C1 includes "Unregister" in DevTools → Application → Service Workers. |
| redux-persist saves something sensitive to `localStorage` in a later phase. | The whitelist only allows `checkout` and `customer`, and a test ensures `api` is never persisted. W5 (card number and CVC never in Redux) is guarded by web 03. |
| MSW fixtures drift from the real API, and the web works against mocks but fails against the backend. | Handlers are typed with `@checkout/shared/contracts`. Checkpoints C1–C3 in `PARALLELIZATION.md` run the web against the real API. |
| Port 5173 or 3000 is taken by the parallel session. | This session only uses 5173. SPEC 02 owns 3000. The proxy only matters with `VITE_API_MOCKING=false`. |
| The Radix `Select` performs poorly on mobile with the 125 municipalities of Antioquia. | Accepted for now (it is DESIGN.md's decision). web 03 measures it and, if needed, proposes `native-select` in its own spec. |

## What is **not** in this spec

- Real pages, feature endpoints and slice actions (web 02 onwards).
- The gateway client (`services/payment-gateway.ts`) and its MSW handlers (web 03/04).
- MSW handlers for the webhook and `health`, and stateful mock scenarios.
- The `Transaction` and `Delivery` tags.
- Product images (web 02).
- Playwright and the `e2e` CI job (web 08).
- CSP and security headers (infra).
- Dark mode, Storybook and TanStack Query.
- Any change to `packages/shared`, `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

Each one of those, if it lands, goes in its own spec.
