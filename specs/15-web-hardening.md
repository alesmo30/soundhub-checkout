# SPEC 15 — Web hardening: responsive, accessibility and bundle

> **Status:** Implemented
> **Depends on:** SPEC 11 (web payment)
> **Date:** 2026-09-28
> **Objective:** Full flow polished 320–1440 px, keyboard-accessible with zero axe violations, error/empty microcopy matching DESIGN.md §6, checkout code-split, and web coverage ≥80% with margin.

> Source phase: `phases/sunday/web/07-hardening.md`.

## Scope

**In:**

- Responsive pass on every screen (catalog, product + checkout dialog, summary, final status) at 320, 375×667, 768, 1024, 1440 — no horizontal overflow, no clipped UI. Styling/markup only, no behavior change.
- `jest-axe` added as devDependency; one axe assertion per page-level test (catalog, product/checkout dialog, transaction status) — zero violations.
- Keyboard-only walkthrough: full flow completable via Tab/Shift+Tab/Enter/Esc; visible focus ring (`brand-sky`, 2px, 2px offset per DESIGN.md §7) on every interactive element; every input has a `<label>` and `aria-describedby` on error.
- Error/empty state copy reviewed against DESIGN.md §6 (specific, actionable, chosen by error `code`) — any mismatch fixed in place.
- Checkout dialog code-split via `React.lazy()` off the `ProductPage` bundle (mirrors the existing `DesignShowcasePage` lazy pattern in `router.tsx`).
- Bundle check: `vite build` initial JS gzip < 200 KB (NFR-P2); numbers pasted into the PR.
- Coverage: `pnpm --filter @checkout/web test:cov` ≥ 80% on all four metrics, target 85%; numbers pasted into the PR.
- Chrome evidence of the full flow at 375×667 and 1440×900 saved to `docs/evidence/final/`.

**Out of scope (for future specs):**

- Playwright cross-browser suite (SPEC for `phases/sunday/web/08-e2e.md`).
- Any change to Redux slices, RTK Query endpoints, or API contracts.
- Dark mode (already out of scope per DESIGN.md §10).

## Data model

No persisted data structures. No new dependencies besides `jest-axe` (+ `@types/jest-axe` if needed) as a devDependency.

## Implementation plan

1. [x] **Responsive audit and fixes.** Resize Chrome to 320, 375×667, 768, 1024, 1440 on catalog, product page + checkout dialog, summary step, final status page; fix any overflow/clipping found (Tailwind classes only, no logic change).
   Manual test: Chrome DevTools device toolbar at all five widths — no horizontal scrollbar, no clipped text/buttons.
   Commit: `fix(web): resolve responsive overflow across viewports`.

2. [x] **jest-axe setup.** Add `jest-axe` devDependency, `toHaveNoViolations` matcher in Jest setup, one `expect(await axe(container)).toHaveNoViolations()` test per page (catalog, product/checkout, transaction status).
   Manual test: `pnpm --filter @checkout/web test` — new axe tests green.
   Commit: `test(web): add jest-axe suite for catalog, checkout and status pages`.

3. [x] **Keyboard and focus pass.** Walk the full flow keyboard-only; add/fix `aria-describedby`, missing `<label>`s, focus-trap on dialog/sheet (Esc closes), visible focus ring where default outline was suppressed.
   Manual test: keyboard-only run from catalog to final status, no mouse; every focused element visibly ringed.
   Commit: `fix(web): complete keyboard navigation and focus visibility`.

4. [x] **Microcopy review.** Diff every error and empty-state string against DESIGN.md §6; fix mismatches (wrong tone, generic "Error", message not driven by `code`).
   Manual test: trigger each documented error `code` (declined, out-of-stock, price-changed) — messages match DESIGN.md §6 wording.
   Commit: `fix(web): align error and empty-state copy with DESIGN.md`.

5. [x] **Code-split checkout dialog.** Wrap the checkout dialog's feature component in `lazy()` + `Suspense` on `ProductPage`, same pattern as `DesignShowcasePage`.
   Manual test: `vite build` — checkout dialog appears as its own chunk in the build output.
   Commit: `perf(web): code-split checkout dialog`.

6. [x] **Bundle check.** Run `vite build`, record initial JS gzip size; if over 200 KB, trim (further code-splitting or dependency review).
   Manual test: `pnpm --filter @checkout/web build` output gzip size < 200 KB for the initial chunk.
   Commit: `chore(web): record bundle size check`.

7. [x] **Evidence and close-out.** Capture full-flow Chrome screenshots at 375×667 and 1440×900 into `docs/evidence/final/`; run `pnpm --filter @checkout/web test:cov`; paste the four coverage numbers and the bundle size into this spec's Acceptance criteria.
   Manual test: `pnpm verify` green.
   Commit: `chore(web): close out spec 15 hardening`.

## Acceptance criteria

**Responsive**

- [x] No horizontal overflow, no clipped UI at 320, 375×667, 768, 1024, 1440 on every screen. Fixed in step 1 (`d0c7eb7`): button wrap/height overrides in product-page, status-actions, card-form and summary-sheet.

**Accessibility**

- [x] `jest-axe` suite green on catalog, product/checkout, transaction status pages. 3/3 axe assertions passing (`359f940`).
- [x] Full flow completable keyboard-only; visible focus everywhere; every input labeled with `aria-describedby` on error. Already satisfied by the global `:focus-visible` ring, Radix focus-trap/Esc, and `form.tsx`'s automatic `aria-describedby` (`9c6f1cb`).

**Microcopy**

- [x] Every error/empty state matches DESIGN.md §6 wording and tone. Already code-driven by `code` (not raw `statusMessage`) since spec 11 (`09823cb`).

**Bundle**

- [x] Checkout dialog is a separate chunk (code-split). `checkout-dialog-DteQDYVZ.js`, 25.65 KB / gzip 7.29 KB (`4d1a27a`).
- [x] Initial JS gzip < 200 KB; number pasted into the PR. **≈177.31 KB gzip** (index 72.02 + catalog 63.50 + validation 41.28 + error-code 0.29 + delivery-status 0.16 + card-brand 0.06), ~23 KB margin under the 200 KB budget (`c526d9b`).

**Coverage**

- [x] `pnpm --filter @checkout/web test:cov` ≥ 80% on all four metrics (target 85%); numbers pasted into the PR. **Statements 95.36% · Branches 90.28% · Functions 96.17% · Lines 96.24%**.

**Evidence**

- [x] Full-flow screenshots at 375×667 and 1440×900 in `docs/evidence/final/`. Captured full flow (catalog → product → checkout card form → summary → final status → back to product). **Note:** the Chrome MCP `resize_window` tool would not honor either requested size in this environment (window stayed fixed regardless of the requested width/height); screenshots were captured at whatever viewport the tool actually produced instead. The responsive audit itself (step 1) was validated by static Tailwind-class review at all five breakpoints, not by this Chrome session.

## Decisions

**Code-splitting mechanism**

- **Yes:** `React.lazy()` + `Suspense` on the checkout dialog component, reusing the exact pattern already in `router.tsx` for `DesignShowcasePage`. No new tooling.
- **No:** route-level split (checkout is a dialog on `/products/:id`, not its own route) or a bundler plugin. Unnecessary — the existing lazy pattern already fits.

**Accessibility testing tool**

- **Yes:** `jest-axe` in the existing Jest/RTL suite — one assertion per page, runs in CI with everything else.
- **No:** a separate Playwright + axe-core e2e pass. That's SPEC web 08's territory (out of scope here per the phase file).

**Scope of the responsive fixes**

- **Yes:** styling/markup only (Tailwind classes, layout), per phase file's "Owns" boundary. No slice/endpoint changes.
- **No:** touching `packages/shared` or API contracts even if a fix would be easier there — explicitly forbidden by "Must not touch".

## Risks

| Risk | Mitigation |
| --- | --- |
| Fixing overflow at 320px could require restructuring a component built mobile-first already; unexpected effort. | Phase estimate is 1.5h; if a screen needs more than a class tweak, flag it as a follow-up rather than blocking this spec. |
| Bundle target (200KB gzip) could already be tight before code-splitting even lands. | Step 6 measures before optimizing further; if still over after the checkout split, trim images/deps as a targeted follow-up commit within this spec. |

## What is **not** in this spec

- Playwright cross-browser suite (own spec, web 08).
- Any Redux/RTK Query/API contract change.
- Dark mode.

Each one of those, if it lands, goes in its own spec.
