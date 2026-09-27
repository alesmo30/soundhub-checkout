# SPEC 05 — Web: catalog (product list and product detail)

> **Status:** Approved
> **Depends on:** SPEC 03 (blocking: web app foundation must be merged). Runs in parallel with SPEC 04 (api catalog) in its own worktree, against MSW; checkpoint C1 runs after both merge.
> **Date:** 2026-09-26
> **Objective:** Turn the `/` and `/products/:id` placeholders into the first screen of the five-screen flow: a paginated, mobile-fast catalog, and a product page that shows everything needed to decide and starts the checkout with a chosen quantity.

## Scope

**In:**

Part 1 — product list

- `features/catalog/catalog.api.ts`: `getProducts` and `getProduct` injected into the base API, providing `Product` tags.
- `features/catalog/pages/catalog-page.tsx` on `/`: grid of product cards (1 / 2 / 3 columns at base / `sm` / `lg`), pill pagination with the page in the URL (`?page=2`), and loading, empty and error states.
- Components: `product-card`, `product-grid` (with its skeleton), `product-image` (`srcset` 320/640/960, explicit size, lazy except the first row, skeleton until loaded), `stock-badge`, `pagination`.
- `apps/web/public/images/products/`: 45 WebP files (15 seeded SKUs × 320/640/960) from the manufacturers' product photos, plus `CREDITS.md` with the source of each one. Total < 2 MB.
- `apps/web/scripts/build-product-images.mjs` + `product-images.sources.json`: downloads each source photo, crops it 1:1 on white and writes the three widths with `sharp`.

Part 2 — product detail

- `features/catalog/pages/product-page.tsx` on `/products/:id`: image, brand, name, description, price with the "IVA incluido" breakdown, available stock; two columns from `md`.
- `quantity-selector` (44 px buttons) bounded by `1…maxPurchaseQuantity`, disabled when stock is 0.
- Primary CTA "Pagar con tarjeta de crédito" → `startCheckout({ productId, quantity })`, which opens the checkout dialog.
- Friendly not-found state (404 `PRODUCT_NOT_FOUND`, or a malformed id) with a link to the catalog.
- `features/checkout/checkout.slice.ts`: `setQuantity`, `startCheckout`, `closeCheckout` and their selectors.
- `features/checkout/components/checkout-dialog.tsx`: a **stub** dialog (title + placeholder text) opened by the slice and exported from `features/checkout/index.ts`, so web 03 fills it in without touching `catalog`.
- `features/catalog/index.ts` exports `invalidateProduct(productId)`, which web 04 dispatches on "Volver al producto" so the stock is re-fetched.

Wiring and close-out

- `app/router.tsx`: `/` and `/products/:id` point to `CatalogPage` and `ProductPage` (one import and one `element` each, no tree change). The temporary `useGetProductsQuery` that SPEC 03 left in `CatalogPlaceholderPage` is removed with that placeholder.
- Chrome evidence at 375×667 and 1440×900 in `docs/evidence/catalog/`.
- Lighthouse mobile LCP on the production build (`build` + `preview`), noted in the PR.

**Out of scope (for future specs):**

- Checkout dialog content, forms, locations endpoints (web 03).
- Summary, payment, final status, and the dispatch of `invalidateProduct` (web 04).
- Search, filters or sorting of the catalog.
- Any change to `services/api.ts`, `components/ui/**`, `components/layout/**`, the router tree, `mocks/**`, `packages/shared`, `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

## Prerequisite for SPEC 03 (web app foundation)

SPEC 03's MSW product fixtures (its step 7, still pending) must use **12 of the 15 seeded SKUs below**, with `imageUrl` = `/images/products/<sku>-640.webp`. Otherwise, in mock mode, every card whose SKU has no file shows a broken image. This spec does not edit `mocks/**`.

## Data model

No database or contract changes. Every server shape comes from `@checkout/shared/contracts` (`Paginated<ProductSummary>`, `ProductDetail`).

### Seeded SKUs (from SPEC 02)

`HP-SNY-WH1000XM5`, `HP-SNY-WF1000XM5`, `HP-SNY-WHCH720N`, `HP-BOS-QCULTRA`, `HP-BOS-QCEARBUDS2`, `HP-APL-AIRPODSPRO2`, `HP-APL-AIRPODSMAX`, `HP-JBL-TUNE520BT`, `HP-JBL-LIVE770NC`, `HP-JBL-TOURPRO2`, `HP-SNH-MOMENTUM4`, `HP-SNH-HD660S2`, `HP-BTS-STUDIOPRO`, `HP-SMS-BUDS3PRO`, `HP-ATH-M50X`.

Files: `public/images/products/<sku>-{320,640,960}.webp`.

### Files

```
apps/web/
├─ public/images/products/          45 × <sku>-<width>.webp · CREDITS.md
├─ scripts/
│  ├─ build-product-images.mjs      sources → 1:1 WebP 320/640/960 (sharp)
│  └─ product-images.sources.json   [{ sku, sourceUrl, credit }]
└─ src/features/
   ├─ catalog/
   │  ├─ index.ts                   CatalogPage, ProductPage, invalidateProduct
   │  ├─ catalog.api.ts             getProducts, getProduct
   │  ├─ catalog.constants.ts       PRODUCT_IMAGE_WIDTHS, EAGER_IMAGE_COUNT, grid `sizes`
   │  ├─ pages/                     catalog-page.tsx · product-page.tsx
   │  ├─ components/                product-card · product-grid · product-image · stock-badge
   │  │                             pagination · quantity-selector · catalog-error-state · product-not-found
   │  ├─ hooks/                     use-page-param.ts
   │  └─ lib/                       product-image-srcset.ts · catalog-error-message.ts
   └─ checkout/
      ├─ index.ts                   + CheckoutDialog, actions, selectors
      ├─ checkout.slice.ts          productId, quantity, isDialogOpen
      └─ components/checkout-dialog.tsx   stub; web 03 owns and replaces its content
```

Tests (`*.test.tsx` / `*.test.ts`) sit next to each file.

### Endpoints (`catalog.api.ts`)

```ts
getProducts: query<Paginated<ProductSummary>, { page: number }>
//   GET /products?page&limit=PAGE_SIZE_DEFAULT · keeps { data, meta } whole
//   providesTags: [...data.map(p => ({ type: 'Product', id: p.id })), { type: 'Product', id: 'LIST' }]
getProduct: query<ProductDetail, string>
//   GET /products/:id · transformResponse: (r: ApiResponse<ProductDetail>) => r.data
//   providesTags: (_r, _e, id) => [{ type: 'Product', id }]

export const invalidateProduct = (productId: string) =>
  api.util.invalidateTags([{ type: 'Product', id: productId }, { type: 'Product', id: 'LIST' }]);
```

### Checkout slice (the part this spec owns)

```ts
interface CheckoutState {
  productId: string | null;
  quantity: number;          // ≥ 1
  isDialogOpen: boolean;
  // web 03 adds the delivery and card-summary parts
}
setQuantity({ productId, quantity })
startCheckout({ productId, quantity })   // also sets isDialogOpen = true
closeCheckout()                          // isDialogOpen = false; keeps productId and quantity

selectQuantityFor(productId): number     // persisted quantity if productId matches, else 1
selectIsCheckoutOpen: boolean
```

The slice is already whitelisted in redux-persist (SPEC 03), so a refresh restores both the quantity and an open dialog. The page clamps the shown quantity to `maxPurchaseQuantity` (stock may have dropped since it was saved).

### UI rules

| Element | Rule |
|---|---|
| Page param | `?page` parsed as a positive integer; anything else is treated as 1. Changing page writes `?page=N` (`1` removes it) and scrolls to top. |
| Stock badge | `0` → "Agotado" (`danger`) · `1` → "Última unidad" · `≥ 2` → "N disponibles" (`success`). Always text, never color alone. |
| Images | `src` = `imageUrl` (the `-640` file); `srcset` derived by swapping the `-640.webp` suffix for 320/960 (falls back to `src` only if the suffix differs); `width`/`height` 640; grid `sizes="(min-width:1024px) 330px, (min-width:640px) 50vw, 100vw"`. First 3 cards and the detail image are `loading="eager"` (detail also `fetchpriority="high"`); the rest `lazy`. Skeleton until `onLoad`. |
| Pagination | `<nav aria-label="Paginación">`, "Anterior" / numbers / "Siguiente" as links, pill shape, 44 px targets, `aria-current="page"` on the active one. Hidden when `totalPages ≤ 1`. All page numbers shown (15 products → 2 pages). |
| Loading | List: 10 skeleton cards. Detail: skeleton of both columns. |
| Empty | `totalItems = 0` → "Aún no hay productos disponibles." · page past the end → "Esta página no tiene productos." + link to page 1. |
| Errors | Message by `getErrorCode(error)`: `RATE_LIMITED` → "Hiciste muchas solicitudes seguidas. Espera un momento e inténtalo de nuevo."; anything else (including network, `null`) → "No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo." Button "Reintentar" calls `refetch()`. |
| Not found | `PRODUCT_NOT_FOUND` or `VALIDATION_ERROR` on the detail (e.g. `/products/abc`) → "No encontramos este producto" + link "Ver catálogo". |
| Detail amounts | Price at 36/700 (`formatCop`); below it "IVA incluido: $ 303.345". Stock line "7 unidades disponibles" / "Agotado". |
| Stepper | "−" and "+" icon buttons 44×44 with `aria-label` "Disminuir cantidad" / "Aumentar cantidad"; value announced with `aria-live="polite"`; "−" disabled at 1, "+" disabled at the max; helper "Máximo N por compra" when `maxPurchaseQuantity` is the 10-unit cap. Disabled entirely at stock 0. |
| CTA | Primary button, full width on mobile; disabled (40% opacity) at stock 0. |

## Implementation plan

Prerequisites (not commits):

- SPEC 03 is merged into `main`, and its fixtures use seeded SKUs (see Prerequisite above).
- From the main checkout: `pnpm worktree:new spec-05-web-catalog`; `/spec-impl` runs in that worktree (`AutoCreateBranch: true`).
- `VITE_API_MOCKING=true` for development; port 5173 only.

Each step is one commit after review. Target ≤ ~300 changed lines per step (images, lockfile excluded). Tests with the `react-test-suite-writer` agent. Steps that render UI are checked in Chrome at 375×667 and 1440×900, with screenshots in `docs/evidence/catalog/<nn>-<screen>-<viewport>.png`.

### Part 1 — product list

1. [x] **Product images.** `sharp` as a dev dependency, `scripts/build-product-images.mjs`, `scripts/product-images.sources.json` (one manufacturer photo per SKU), the 45 generated WebP files and `CREDITS.md` (SKU, source URL, "© <manufacturer>, used for a non-commercial demo"). Source downloads go to a git-ignored temp folder.
   Manual test: `du -sh public/images/products` < 2 MB; 45 files; each opens as a 1:1 image; re-running the script produces the same files.
   Commit: `feat(web): add product images`.
   Decision: image files use the seeded SKU in uppercase (`<SKU>-<width>.webp`), matching the API seed's `imageUrl`; SPEC 03's MSW fixtures (wrong SKUs, lowercased `imageUrl`) are fixed in a separate PR before step 4, not on this branch.

2. [x] **Catalog endpoints and checkout quantity actions.** `catalog.api.ts`, `invalidateProduct`, the checkout slice actions and selectors, `catalog/index.ts` and `checkout/index.ts` exports.
   Tests: `getProducts` keeps `meta`; `getProduct` unwraps `data`; `invalidateProduct` triggers a refetch of a subscribed product; slice reducers and `selectQuantityFor` (match → saved value, other product → 1).
   Commit: `feat(web): add catalog endpoints and checkout quantity actions`.
   Decision: `src/test/render-with-providers.spec.tsx` now preloads a full `CheckoutState` because its fields are required (outside the listed diff paths, approved by the user); web tests are named `*.spec.ts(x)`, not `*.test.ts`, because `apps/web/jest.config.js` only matches `.spec`.

3. [x] **Card components.** `stock-badge`, `product-image`, `product-card`, `product-grid` (+ skeleton), `lib/product-image-srcset.ts`, `catalog.constants.ts`.
   Tests: badge text for 0 / 1 / 7; `srcset` derivation and fallback; eager vs lazy by index; skeleton hidden after `load`; card links to `/products/:id` and shows `formatCop` price.
   Commit: `feat(web): add product card and grid components`.

4. [x] **Catalog page.** `use-page-param`, `pagination`, `catalog-error-state`, `lib/catalog-error-message.ts`, `catalog-page.tsx`, and the `/` route pointing to it (placeholder and its temporary query removed).
   Tests (MSW): loading skeleton → 10 cards; "Agotado" visible on the out-of-stock fixture; clicking page 2 updates the URL and shows page-2 items; `aria-current` on the active page; `?page=abc` → page 1; 500 then success via `server.use` → error message → "Reintentar" → cards; `RATE_LIMITED` message; empty catalog; page past the end.
   Chrome: catalog page 1 and 2 at both viewports, error state at mobile.
   Commit: `feat(web): add paginated catalog page`.
   Decision: removing the placeholder's temporary query also deletes `app/temp-catalog-endpoint.ts` and updates `app/router.spec.tsx` (it asserted the catalog placeholder), both outside the listed diff paths.

### Part 2 — product detail

5. [ ] **Quantity selector and checkout dialog stub.** `quantity-selector.tsx`, `checkout/components/checkout-dialog.tsx` (stub on `Dialog`, controlled by `selectIsCheckoutOpen`, `closeCheckout` on close).
   Tests: bounds (can't go below 1 or above max; max = 10 when stock is 25), disabled at stock 0, `aria-live` value; dialog opens when the slice says so and Esc dispatches `closeCheckout`.
   Commit: `feat(web): add quantity selector and checkout dialog stub`.

6. [ ] **Product page.** `product-page.tsx`, `product-not-found.tsx`, and the `/products/:id` route pointing to it.
   Tests (MSW): renders name, brand, description, price, "IVA incluido", stock; stepper bounded by `maxPurchaseQuantity`; CTA disabled at stock 0; CTA dispatches `startCheckout({ productId, quantity })` and the dialog opens; unknown id and `/products/abc` render the not-found state with a link to `/`; `preloadedState` with a saved quantity for this product restores it, and for another product starts at 1; saved quantity above the current max is clamped.
   Chrome: detail at both viewports, out-of-stock product, not-found, dialog stub open; a refresh keeps the quantity (and the open dialog).
   Commit: `feat(web): add product detail page`.

### Close-out

7. [ ] **Performance, PR and green CI.** `pnpm --filter @checkout/web build && preview`, Lighthouse mobile on `/` (LCP noted in the PR); `test:cov` ≥ 80 %; push, open the PR with `gh-cli` linking the evidence, wait for CI, fix whatever fails; mark this spec `Implemented` and tick its criteria. If SPEC 04 merged first and the lockfile conflicts, apply the lockfile protocol.
   Commit: `docs: mark spec 05 as Implemented`.

Notes:

- If CI fails in step 7, the fix goes in its own `fix(web): …` commit, after review.
- If a contract field is missing, apply the contract-change protocol; never edit `packages/shared` from this branch.

## Acceptance criteria

Catalog

- [ ] `/` shows 10 cards on page 1 against MSW; each has image, brand, name, `formatCop` price and a stock badge.
- [ ] 1 / 2 / 3 columns at 375 / 640 / 1024 px wide; no horizontal scroll at 320 px.
- [ ] A product with `stockAvailable: 0` shows "Agotado".
- [ ] Pagination is keyboard reachable, marks the active page with `aria-current="page"`, and `?page=2` survives a reload and a shared link.
- [ ] `?page=abc`, `?page=0` and `?page=-1` show page 1.
- [ ] Loading shows skeletons; an empty catalog and a page past the end show their messages; an error shows the `ErrorCode`-driven message and "Reintentar" recovers.
- [ ] Every product `<img>` has `srcset` with 320w/640w/960w, `width` and `height`; only the first 3 on the list are not `lazy`.

Images

- [ ] `public/images/products` holds exactly 45 files named `<sku>-<width>.webp` for the 15 seeded SKUs, totalling < 2 MB.
- [ ] `CREDITS.md` lists the source of each image.

Product page

- [ ] `/products/:id` shows image, brand, name, description, price, "IVA incluido" amount and stock; two columns from 768 px.
- [ ] The stepper never goes below 1 or above `maxPurchaseQuantity`; its buttons are ≥ 44 px.
- [ ] At stock 0 the stepper and the CTA are disabled.
- [ ] The CTA dispatches `startCheckout({ productId, quantity })` and the checkout dialog stub opens; Esc closes it.
- [ ] Refreshing `/products/:id` restores the selected quantity; another product starts at 1.
- [ ] An unknown id and a malformed id show "No encontramos este producto" with a link to `/`.
- [ ] `invalidateProduct(id)` is exported from `@/features/catalog` and makes a mounted product page re-fetch (test).

Quality

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter @checkout/web test:cov` (≥ 80 % on all four metrics) exit 0.
- [ ] No `useEffect` fetches data and no server data is copied into a slice (only `productId`/`quantity`).
- [ ] Chrome evidence at 375×667 and 1440×900 in `docs/evidence/catalog/`; Lighthouse mobile LCP noted in the PR.
- [ ] `git diff main --stat` touches only `apps/web/src/features/catalog/**`, `features/checkout/{checkout.slice.ts,index.ts,components/checkout-dialog.tsx}`, `app/router.tsx`, `app/placeholder-pages.tsx`, `apps/web/public/images/products/**`, `apps/web/scripts/**`, `apps/web/package.json`, `pnpm-lock.yaml`, `docs/evidence/catalog/**` and `specs/`.
- [ ] A case-insensitive search for the payment provider's brand name in the branch diff returns no match.

## Decisions

Spec and branch

- **Yes:** SPEC 05, branch `spec-05-web-catalog` in its own worktree. SPEC 03 is web foundation and SPEC 04 is the api catalog.
- **No:** `feat/02-web-catalog` from the phase file.
- **Yes:** one spec for both parts, one PR, as the phase file says.

Images

- **Yes:** the manufacturers' product photos, by the user's explicit decision: this is a non-production assessment and the real product photos make the demo credible. Each source is listed in `CREDITS.md`.
- **No:** Unsplash/Pexels as the phase's R6 asks. Royalty-free photos almost never show the exact model. This is a conscious deviation from R6; if the repository is public, the photos are redistributed with it, so this decision can be reverted by swapping the sources file and re-running the script.
- **Yes:** a committed, re-runnable script with `sharp` and a committed sources file, so the images are reproducible. The downloaded originals are not committed.
- **No:** converting by hand with a local tool, which nobody else could reproduce.

Checkout hand-off

- **Yes:** a stub `checkout-dialog.tsx` in `features/checkout`, exported from its `index.ts` and mounted by `ProductPage`. web 03 owns that file and replaces its content without touching `catalog` (its "must not touch"). This stretches the phase's "slice file only" by one file, agreed with the user.
- **No:** only a flag in the slice. web 03 would have nowhere to mount the dialog without editing catalog, the layout or the router.
- **Yes:** `closeCheckout` in addition to the phase's `startCheckout` / `setQuantity`; the stub needs Esc to work.
- **Yes:** the persisted quantity applies only to the same `productId`; another product starts at 1.
- **Yes:** `isDialogOpen` is persisted with the rest of the slice, so a refresh mid-checkout reopens the dialog (web 03's refresh-restore builds on it).
- **Yes:** `invalidateProduct` lives in `catalog` (which provides the tag) and is exported from its `index.ts`; web 04 only dispatches it.

Data and states

- **Yes:** `limit` is fixed at `PAGE_SIZE_DEFAULT`; only `page` lives in the URL.
- **Yes:** an invalid `?page` is treated as 1 on the client instead of sending it and showing a 400.
- **Yes:** a malformed product id (API 400) shows the same not-found state as a 404; for the customer both mean "this product does not exist".
- **Yes:** the shown quantity is clamped to the current `maxPurchaseQuantity`, because stock may drop after it was saved.
- **Yes:** all page numbers are rendered, no ellipsis. 15 products give 2 pages; an ellipsis algorithm would be speculative code.

Performance

- **Yes:** the first 3 cards eager (covers the first row at every breakpoint) and the detail image with `fetchpriority="high"`; everything else lazy.
- **Yes:** LCP measured on `build` + `preview`, not on the dev server, which is unbundled and slower than any real build.

## Risks

| Risk | Mitigation |
| --- | --- |
| SPEC 03's fixtures use SKUs with no image, and mock mode shows broken images. | Prerequisite section above, handed to the SPEC 03 session before its step 7. Step 4's Chrome check catches it. |
| A manufacturer URL disappears or blocks downloads. | Pick another official product photo and update `product-images.sources.json`; the committed WebP files do not depend on the URL staying alive. |
| The 45 images exceed 2 MB. | The script uses WebP quality ~72 and 1:1 crops; step 1 checks `du -sh` before committing and lowers the quality if needed. |
| `sharp` native binaries fail to install on CI or another machine. | It is only used by the script, never by the build or tests; CI never runs it. |
| The persisted slice shape changes when web 03 adds fields, and old `localStorage` breaks rehydration. | web 03 adds fields with defaults; if a shape change is incompatible, it bumps the persist `version` with a migration (SPEC 03 prepared `version: 1`). |
| The API returns a relative `imageUrl` while the contract example shows an absolute one. | The srcset helper only swaps the `-640.webp` suffix, so it works with both; checkpoint C1 verifies it. |
| Lockfile conflict with SPEC 04. | SPEC 04 adds no dependencies; if it still conflicts, apply the lockfile protocol. |

## What is **not** in this spec

- Checkout dialog content and forms (web 03), summary, payment and final status (web 04).
- Search, filters, sorting.
- Changes to `services/api.ts`, `components/ui`, `components/layout`, the router tree or `mocks/**`.
- Any change to `packages/shared`, `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

Each of these, if it lands, goes in its own spec.
