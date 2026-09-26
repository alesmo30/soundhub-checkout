# apps/web — CLAUDE.md

Loads automatically when working inside `apps/web`. Root `CLAUDE.md` still applies.

- **Every visual change follows `apps/web/DESIGN.md`** (tokens, components,
  checkout patterns, formats, accessibility).
- Boundaries (W1–W7): `references/layering.md#web--by-feature`.
- Every change is validated in Chrome at 375×667 and 1440×900, with
  screenshots saved to `docs/evidence/<feature>/` before the step summary.

## Where things live
- `src/app/` store (redux-persist whitelist: `checkout`, `customer`), router, typed hooks.
- `src/config/env.ts` is the only reader of `import.meta.env` (mocked in Jest).
- `src/services/api.ts` RTK Query base API; `src/services/payment-gateway.ts`
  acceptance tokens + card tokenization with the public key.
- `src/components/ui/` shadcn primitives (add them with the shadcn CLI; no business logic).
- `src/features/{catalog,checkout,transaction,customer}` with an `index.ts` each.
- Routes: `/`, `/products/:id` (checkout dialog opens here), `/transactions/:id` (final status).

## Rules worth repeating here
- Forms: react-hook-form + Zod schemas from `@checkout/shared/validation`,
  rendered with the shadcn `Form` components.
- The card number and CVC stay in the card form's local state only.
- Server data comes from RTK Query hooks; no `useEffect` fetching, no copies in slices.
- Money is formatted only with the `formatCop` helper in `src/lib/money.ts`.
