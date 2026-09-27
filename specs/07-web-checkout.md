# SPEC 07 — Web: checkout (customer, delivery and card forms)

> **Status:** Approved
> **Depends on:** SPEC 05 (blocking: the web catalog must be merged, since this spec replaces its checkout dialog stub and extends its slice). Runs in parallel with SPEC 06 (api checkout) in its own worktree, against MSW; checkpoint C2 runs after both merge.
> **Date:** 2026-09-27
> **Objective:** Turn the checkout dialog stub into step 2 of the flow: a two-step form that collects customer and delivery data, shows the server-computed total, and tokenizes the card directly with the payment gateway so only `{ token, brand, last4 }` ever reaches the app state, and only in memory.

> Source phase: `phases/saturday/web/03-checkout.md` (Part 1 customer and delivery, Part 2 card and tokenization).
> SPEC 05 is the web catalog and SPEC 06 the api checkout, so this spec takes 07.

## Scope

**In:**

Part 1 — customer and delivery (sub-step 2a, `CONTACT`)

- `features/checkout/checkout.api.ts`: `getDepartments`, `getMunicipalities(departmentCode)` and `getQuote({ productId, quantity, municipalityCode })`, injected into the base API.
- `checkout-dialog.tsx` replaces SPEC 05's stub:
  - desktop: two panels (left `surface-tint`: product × quantity and the amount box; right: the current sub-step);
  - mobile: full screen, with a compact summary on top;
  - focus trap and Esc to close.
- `amount-box.tsx`: "¿Cuánto vas a pagar?" with `totalInCents` from `getQuote`, fetched as soon as a municipality is chosen. Before that, the box shows "Selecciona tu municipio para calcular el total".
- `contact-form.tsx` with two sections:
  - "Tus datos": full name, national ID, email, mobile with a separate `+57` prefix;
  - "Entrega": department → municipality cascading selects, address, optional complement.
- Validation with `customerSchema` and `deliverySchema` from `@checkout/shared/validation`; inline errors linked with `aria-describedby`.
- The recipient (`recipientName`, `phone`) is always the customer. There are no recipient fields.
- "Recordarme en este dispositivo" checkbox. Only when it is checked on "Continuar" are the customer and address written to the persisted `customer` slice.
- "Hola, <first name>. ¿No eres tú? **Olvidar mis datos**" banner when the form is pre-filled. The link clears the remembered data, the form and the in-memory session.
- "Continuar" is enabled only when the form is valid (40 % opacity when disabled).

Part 2 — card and tokenization (sub-step 2b, `CARD`)

- `services/payment-gateway.ts`: `fetchAcceptanceTokens()` (`GET /merchants/{publicKey}`) and `tokenizeCard(card)` (`POST /tokens/cards`), both plain `fetch` functions with the public key.
- `getAcceptanceTokens` endpoint in `checkout.api.ts` (a `queryFn` over `fetchAcceptanceTokens`), always fetched fresh when 2b mounts.
- `card-form.tsx`:
  - card number with a 4-4-4-4 mask and the VISA / Mastercard logo inside the input;
  - holder;
  - MM/AA with an automatic `/`, and CVC, side by side;
  - installments select 1–36, default 1;
  - validation with `cardSchema`.
- `card-brand-icon.tsx` (inline SVG logos) driven by `detectCardBrand` from `@checkout/shared/validation`.
- `lib/masks.ts`: `formatCardNumber`, `formatExpiry`, `digitsOnly`.
- `legal-acceptance.tsx`: two mandatory checkboxes linking to both permalinks.
- On "Continuar", `tokenizeCard` is called from the form's submit handler, never through RTK Query. On success only `{ token, brand, last4 }`, the installments and both acceptance tokens are stored, in memory, and the step moves to `SUMMARY`.
- Gateway error messages and the fixed test-mode note (see **UI rules**).
- `summary-sheet.tsx`: a **stub** (title, masked card, "Editar" back to 2b) shown on `SUMMARY`. web 04 owns and replaces its content.

State

- `checkout` slice (persisted) gains `step` and `goToStep`.
- New `checkoutSession` slice (**not** persisted) holds the in-progress contact details, the quote municipality, the card summary, the installments and the acceptance tokens.
- `customer` slice (persisted) holds only what the customer asked to remember.
- `app/store.ts` registers `checkoutSession` outside the whitelist, and bumps the persist `version` to 2 with a migration for the new `checkout` and `customer` shapes.

Wiring and close-out

- `mocks/handlers/payment-gateway.handlers.ts`, registered in `mocks/handlers/index.ts`.
- `features/catalog/index.ts` also exports `useGetProductQuery` (one line), so the dialog reads the product from the cache the product page already filled.
- Chrome evidence at 375×667 and 1440×900 in `docs/evidence/checkout/`.

**Out of scope (for future specs):**

- Summary content, `upsertCustomer`, `createTransaction`, the idempotency key and payment errors (web 04).
- Fetching new acceptance tokens after a failed payment attempt (web 04).
- Clearing `checkoutSession` after a final payment status (web 04).
- "Another person receives the order" (separate recipient fields).
- Saved cards, or restoring a card token after a refresh.
- The CloudFront CSP `connect-src` for the gateway sandbox (infra).
- Any change to `services/api.ts`, `components/ui/**`, `components/layout/**`, the router, other `mocks/**` handlers or fixtures, `packages/shared`, `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

## Data model

No database or contract changes. Server shapes come from `@checkout/shared/contracts` (`Department`, `Municipality`, `Quote`, `ProductDetail`). Form values come from `@checkout/shared/validation` (`CustomerFormValues`, `DeliveryFormValues`, `CardFormValues`).

### Files

```
apps/web/src/
├─ app/store.ts                         + checkoutSession reducer (not whitelisted) · persist version 2 + migration
├─ services/payment-gateway.ts          fetchAcceptanceTokens(), tokenizeCard()
├─ mocks/handlers/
│  ├─ payment-gateway.handlers.ts       GET */merchants/:publicKey · POST */tokens/cards
│  └─ index.ts                          + paymentGatewayHandlers
└─ features/
   ├─ catalog/index.ts                  + useGetProductQuery
   ├─ customer/
   │  ├─ index.ts                       customerReducer, rememberDetails, forgetDetails, selectRememberedDetails
   │  └─ customer.slice.ts              { remembered: ContactDetails | null }
   └─ checkout/
      ├─ index.ts                       CheckoutDialog, actions, selectors (web 04 reads the session through here)
      ├─ checkout.api.ts                getDepartments, getMunicipalities, getQuote, getAcceptanceTokens
      ├─ checkout.slice.ts              + step, goToStep
      ├─ checkout-session.slice.ts      in-memory session (see below)
      ├─ checkout.constants.ts          CheckoutStep, TEST_CARDS copy, gateway error copy
      ├─ components/
      │  checkout-dialog · order-panel · amount-box
      │  contact-form · remembered-banner
      │  card-form · card-brand-icon · legal-acceptance · gateway-error
      │  summary-sheet (stub)
      ├─ hooks/use-checkout-step.ts     derived step (see below)
      └─ lib/
         masks.ts                       formatCardNumber, formatExpiry, digitsOnly
         contact-details.ts             contactFormSchema, toDeliveryValues()
```

Tests are named `*.spec.ts(x)` and sit next to each file, as `apps/web/jest.config.js` requires.

### Shared types

```ts
// features/checkout/lib/contact-details.ts
type DeliveryAddress = Omit<DeliveryFormValues, 'recipientName' | 'phone'>;
//   { departmentCode, municipalityCode, addressLine, addressDetail? }

interface ContactDetails {
  customer: CustomerFormValues;   // documentNumber, fullName, email, phone
  address: DeliveryAddress;
}

// customerSchema merged with deliverySchema minus recipientName/phone
const contactFormSchema;

// recipientName = customer.fullName, phone = customer.phone (web 04 builds the POST body with it)
function toDeliveryValues(details: ContactDetails): DeliveryFormValues;
```

### `checkout` slice (persisted)

```ts
type CheckoutStep = 'CONTACT' | 'CARD' | 'SUMMARY';

interface CheckoutState {
  productId: string | null;
  quantity: number;
  isDialogOpen: boolean;
  step: CheckoutStep;            // new, default 'CONTACT'
}
goToStep(step: CheckoutStep)
```

### `checkoutSession` slice (memory only)

```ts
interface CardSummary { token: string; brand: CardBrand; last4: string }
interface AcceptanceTokens { acceptanceToken: string; personalDataAuthToken: string }

interface CheckoutSessionState {
  contact: ContactDetails | null;          // set on 2a "Continuar"
  quoteMunicipalityCode: string | null;    // set when a municipality is chosen, before "Continuar"
  card: CardSummary | null;                // set on successful tokenization
  installments: number;                    // default 1
  acceptance: AcceptanceTokens | null;     // set together with card
}
saveContact(details)
setQuoteMunicipality(code)
saveCard({ card, installments, acceptance })
clearCheckoutSession()
// extraReducers:
//   closeCheckout → card = null, acceptance = null   (the card is always entered again)
//   forgetDetails → whole session back to initial
```

### `customer` slice (persisted)

```ts
interface CustomerState { remembered: ContactDetails | null }
rememberDetails(details)
forgetDetails()
selectRememberedDetails
```

`checkout` imports `forgetDetails` from `@/features/customer`. `customer` never imports from `checkout`.

### Derived selectors

```ts
selectContactDetails   = session.contact ?? customer.remembered
selectQuoteMunicipality = session.quoteMunicipalityCode ?? selectContactDetails?.address.municipalityCode ?? null

// use-checkout-step.ts — the persisted step is only a wish; the data decides
effective step:
  step === 'SUMMARY' && session.card                  → 'SUMMARY'
  step !== 'CONTACT' && selectContactDetails !== null → 'CARD'
  otherwise                                           → 'CONTACT'
```

That one rule covers a refresh, closing and reopening, and switching product:

- a refresh empties the session, so `SUMMARY` never survives it;
- with remembered details, a refresh on `CARD` or `SUMMARY` lands on `CARD`, and without them on `CONTACT`;
- closing drops the card, so reopening lands on `CARD` with 2a still filled.

### Persist migration

`PERSIST_VERSION` goes from 1 to 2. The migration adds `step: 'CONTACT'` to `checkout` and replaces `customer` with `{ remembered: null }`. Without it, redux-persist's level-1 merge would restore the old `checkout` object without `step`.

### Endpoints (`checkout.api.ts`)

```ts
getDepartments: query<Department[], void>
//   GET /locations/departments · transformResponse unwraps data
getMunicipalities: query<Municipality[], string>
//   GET /locations/departments/:code/municipalities · skipped until a department is chosen
getQuote: query<Quote, QuoteQuery>
//   GET /quotes?productId&quantity&municipalityCode · providesTags [{ type: 'Quote' }]
//   used with refetchOnMountOrArgChange: true (stock and price are live)
getAcceptanceTokens: query<AcceptanceTerms, void>
//   queryFn → fetchAcceptanceTokens() · used with refetchOnMountOrArgChange: true (single-use tokens)
```

### Payment gateway service

```ts
// services/payment-gateway.ts
interface AcceptanceTerms {
  acceptanceToken: string;         // data.presigned_acceptance.acceptance_token
  termsUrl: string;                // data.presigned_acceptance.permalink
  personalDataAuthToken: string;   // data.presigned_personal_data_auth.acceptance_token
  personalDataUrl: string;         // data.presigned_personal_data_auth.permalink
}
fetchAcceptanceTokens(): Promise<AcceptanceTerms>        // throws on non-2xx; the queryFn maps it to an error

type TokenizeResult =
  | { ok: true; card: CardSummary }                      // data.id, data.brand, data.last_four
  | { ok: false; reason: 'INVALID_CARD' | 'UNAVAILABLE' };
tokenizeCard(card: CardFormValues): Promise<TokenizeResult>
//   body { number, cvc, exp_month, exp_year, card_holder } · Authorization: Bearer <public key>
//   2xx → ok · 4xx → INVALID_CARD · network or 5xx → UNAVAILABLE · unknown brand → INVALID_CARD
//   never logs, never throws with the card in the message
```

URL and key come from `env.paymentGatewayUrl` and `env.paymentGatewayPublicKey`.

### MSW gateway handlers

| Request | Response |
|---|---|
| `GET */merchants/:publicKey` | 200 with both presigned tokens (`test-acceptance-token`, `test-personal-data-token`) and `https://example.test/…` permalinks |
| `POST */tokens/cards`, number `4242…` or `4111…` | 201 `{ data: { id: 'tok_test_…', brand: 'VISA', last_four } }` |
| `POST */tokens/cards`, any other number | 422 `{ error: { type: 'INPUT_VALIDATION_ERROR' } }` |

Tests override them with `server.use` for 500 and network errors.

### UI rules

| Element | Rule |
|---|---|
| Dialog | `Dialog` on every width; full screen below `md`, two panels from `md`, max width 1040 px. Title "Pago con tarjeta". Esc and the close button dispatch `closeCheckout`. |
| Order panel | Product image, name, "× N". Below it the amount box. On mobile it collapses into one line (name × N · total) above the form. |
| Amount box | No municipality → "Selecciona tu municipio para calcular el total". Loading → skeleton + "Calculando total…". 200 → `formatCop(totalInCents)` at 36/700. `OUT_OF_STOCK` → "Solo quedan N unidades. Vuelve al producto para ajustar la cantidad." + link; 2a "Continuar" disabled. Any other error → "No pudimos calcular el total." + "Reintentar" (`refetch`). |
| Contact form | Label above each input, placeholder "Ingresa tu …", 16 px text, 44 px height. Mobile `+57` shown as a separate prefix; the value stays 10 digits. Municipality select disabled until a department is chosen; changing department resets it. |
| Remembered banner | Shown only when the form was pre-filled from `customer.remembered`. "Olvidar mis datos" is a `link` button. |
| Card number | `inputMode="numeric"`, `autocomplete="cc-number"`, shown as `4242 4242 4242 4242`. Logo on the right inside the input when `detectCardBrand` returns a brand; nothing otherwise. |
| Expiry / CVC | Side by side on every width. `autocomplete="cc-exp"` / `cc-csc`; CVC `type="password"`. |
| Installments | `Select` 1–36, "1 cuota" / "N cuotas", default 1. |
| Legal acceptance | Two required checkboxes: "Acepto los términos y condiciones" (link to `termsUrl`) and "Autorizo el tratamiento de mis datos personales" (link to `personalDataUrl`), links open in a new tab. Loading → skeleton. Error → "No pudimos cargar los términos y condiciones." + "Reintentar". |
| 2b "Continuar" | Enabled only when the card form is valid, both boxes are checked and the terms loaded. While tokenizing: disabled, label "Validando tarjeta…". |
| Gateway errors | `INVALID_CARD` → "Revisa los datos de tu tarjeta e inténtalo de nuevo." · `UNAVAILABLE` → "No pudimos validar tu tarjeta. Inténtalo de nuevo en un momento." Shown above the button with `role="alert"`; the button stays enabled. |
| Test-mode note | Always visible in 2b: "En modo de pruebas solo funcionan las tarjetas 4242 4242 4242 4242 (aprobada) y 4111 1111 1111 1111 (rechazada)." |
| Back | 2b has a secondary "Volver" to 2a; it keeps the typed card only while 2b stays mounted. |

## Implementation plan

Prerequisites (not commits):

- SPEC 05 is merged into `main`.
- From the main checkout: `pnpm worktree:new spec-07-web-checkout`; `/spec-impl` runs in that worktree (`AutoCreateBranch: true`).
- `VITE_API_MOCKING=true` for development; port 5173 only.

Each step is one commit after review. Target ≤ ~300 changed lines per step. Tests with the `react-test-suite-writer` agent. Steps that render UI are checked in Chrome at 375×667 and 1440×900, with screenshots in `docs/evidence/checkout/<nn>-<screen>-<viewport>.png`.

### State and data

1. [ ] **Checkout endpoints.** `checkout.api.ts` with `getDepartments`, `getMunicipalities` and `getQuote`.
   Tests (MSW): departments and municipalities unwrap `data`; `getMunicipalities('99')` surfaces `DEPARTMENT_NOT_FOUND`; `getQuote` sends the three query params and unwraps `data`.
   Commit: `feat(web): add locations and quote endpoints to checkout`.

2. [ ] **Checkout state.** `lib/contact-details.ts`, `checkout-session.slice.ts`, the `step` in `checkout.slice.ts`, the `customer` slice, `use-checkout-step.ts`, the store registration and the persist migration. `checkout/index.ts` and `customer/index.ts` exports.
   Tests:
   - reducers and selectors of the three slices;
   - `closeCheckout` drops `card` and `acceptance` but keeps `contact`; `forgetDetails` clears `remembered` and the whole session;
   - every row of the derived-step rule;
   - `toDeliveryValues` copies name and phone into the recipient;
   - the migration turns a version-1 state into a valid version-2 state;
   - after dispatching `saveContact` and `saveCard`, the persisted `localStorage` value contains neither the token nor the document number.

   Commit: `feat(web): add checkout step, in-memory session and remembered details`.

### Part 1 — customer and delivery

3. [ ] **Dialog shell and amount box.** `checkout-dialog.tsx` (replaces the stub), `order-panel.tsx`, `amount-box.tsx`, the sub-step switch driven by `useCheckoutStep` (placeholders for 2a and 2b), and the `useGetProductQuery` export in `catalog/index.ts`.
   Tests (MSW): two panels are rendered, and Esc dispatches `closeCheckout`; amount box without a municipality, loading, total `$ 3.920.460` from the fixture, `OUT_OF_STOCK` message with its link, and a 500 error then "Reintentar" to the total.
   Chrome: the dialog at both viewports with and without a total.
   Commit: `feat(web): add checkout dialog shell with amount box`.

4. [ ] **Contact form fields.** `contact-form.tsx` with both sections, the cascading selects and `setQuoteMunicipality` on municipality change. It is wired into the `CONTACT` sub-step, with "Continuar" not yet dispatching anything but `saveContact`.
   Tests (MSW): one validation message per field, and `aria-describedby` linking it; the municipality select is disabled until a department is chosen, and loads that department's list; changing department resets the municipality; choosing a municipality triggers the quote; "Continuar" is disabled until valid.
   Chrome: the empty form, a form with errors, and a filled form, at both viewports.
   Commit: `feat(web): add customer and delivery form`.

5. [ ] **Remember me and continue.** The "Recordarme en este dispositivo" checkbox, `remembered-banner.tsx`, and the full "Continuar" (save the session, remember or forget, `goToStep('CARD')`).
   Tests:
   - checked → `customer.remembered` is set, and a new store preloaded with it pre-fills the form and shows the banner;
   - unchecked → nothing reaches `customer`, and a previously remembered value is forgotten;
   - "Olvidar mis datos" empties the form, `remembered` and the session;
   - a store rebuilt from the persisted value without remember-me opens on `CONTACT` with an empty form, and with remember-me on `CARD`.

   Chrome: the pre-filled form with the banner, and the refresh behaviour.
   Commit: `feat(web): remember customer details on this device`.

### Part 2 — card and tokenization

6. [ ] **Payment gateway service.** `services/payment-gateway.ts`, `payment-gateway.handlers.ts` with its registration, and the `getAcceptanceTokens` endpoint.
   Tests: acceptance terms mapped from the presigned fields; non-2xx makes the query fail; `tokenizeCard` returns `ok` with `{ token, brand, last4 }` for 4242, `INVALID_CARD` for a 422, `UNAVAILABLE` for a 500 and for a network error; the request body carries `exp_month`/`exp_year` split from `MM/AA`; a `console` spy sees nothing during any call.
   Manual test: one real sandbox call to `GET /merchants/{publicKey}` from the browser console with mocking off, checking the `permalink` key paths only.
   Commit: `feat(web): add payment gateway service`.

7. [ ] **Card form fields.** `lib/masks.ts`, `card-brand-icon.tsx` and `card-form.tsx` (number, holder, expiry, CVC, installments), wired into the `CARD` sub-step with "Volver". No submit yet.
   Tests: `formatCardNumber`, `formatExpiry` and `digitsOnly` tables; the logo shows VISA for `4`, Mastercard for `51`, `55`, `2221` and `2720`, and nothing for `56` or `2721`; one validation message per field (Luhn, expired, CVC, holder); installments default to 1 and offer 36 options.
   Chrome: the empty card form, VISA detected, Mastercard detected, and errors, at both viewports.
   Commit: `feat(web): add card form with brand detection`.

8. [ ] **Legal acceptance and tokenization.** `legal-acceptance.tsx`, `gateway-error.tsx`, the test-mode note, the submit handler calling `tokenizeCard`, `saveCard`, `goToStep('SUMMARY')`, and the `summary-sheet.tsx` stub.
   Tests (MSW):
   - both checkboxes render with their links; "Continuar" stays disabled until both are checked; terms error then "Reintentar";
   - 4242 → the stub shows `VISA •••• 4242`, and the session holds the token, the installments and both acceptance tokens;
   - 422 → `INVALID_CARD` message, still on `CARD`; 500 → `UNAVAILABLE` message;
   - "Validando tarjeta…" while the request is pending;
   - after a successful submit, neither the Redux state (`store.getState()`, including `api`) nor `localStorage` contains the card number or the CVC;
   - closing and reopening lands on `CARD` with an empty card form.

   Chrome: the acceptances, a gateway error, tokenizing, and the summary stub, at both viewports.
   Commit: `feat(web): tokenize the card with the payment gateway`.

### Close-out

9. [ ] **Coverage and close-out.** `pnpm lint`, `pnpm typecheck` and `pnpm --filter @checkout/web test:cov` (≥ 80 % on all four metrics); check the evidence folder has every screenshot; mark this spec `Implemented` and tick its criteria. Push and open the PR only when the user asks. If SPEC 06 merged first and the lockfile conflicts, apply the lockfile protocol.
   Commit: `docs: mark spec 07 as Implemented`.

Notes:

- If CI fails, the fix goes in its own `fix(web): …` commit, after review.
- If a contract field is missing, apply the contract-change protocol; never edit `packages/shared` from this branch.
- Checkpoint C2 (this web against SPEC 06's API) runs after both PRs merge. It is not a step of this spec.

## Acceptance criteria

Dialog and amount

- [ ] The CTA on `/products/:id` opens the dialog: two panels from 768 px, full screen below it, focus trapped, Esc closes it.
- [ ] The amount box shows "Selecciona tu municipio…" until a municipality is chosen, then `formatCop(totalInCents)` from `GET /quotes`. No amount in the dialog is computed on the client.
- [ ] `OUT_OF_STOCK` from the quote shows the "Solo quedan N unidades" message and disables 2a "Continuar"; any other quote error shows "Reintentar", and it recovers.

Customer and delivery

- [ ] Every field shows its `VALIDATION_MESSAGES` text inline, linked with `aria-describedby`.
- [ ] The municipality select lists only the chosen department's municipalities, and resets when the department changes.
- [ ] "Continuar" is disabled (40 % opacity) until the form is valid.
- [ ] Without "Recordarme", a refresh reopens the dialog on 2a with an empty form, and `localStorage` holds no document number, email or phone.
- [ ] With "Recordarme", a refresh reopens on 2b with 2a pre-filled and the "¿No eres tú?" banner; "Olvidar mis datos" empties the form and removes the data from `localStorage`.
- [ ] The recipient sent onwards is the customer's name and phone (`toDeliveryValues`).

Card and tokenization

- [ ] Typing `4` shows the VISA logo, and `51`–`55` or `2221`–`2720` the Mastercard logo; `56` shows none.
- [ ] The number is shown as `4242 4242 4242 4242`, and the expiry gets its `/` automatically.
- [ ] Luhn, expiry, CVC and holder errors show inline; installments default to 1 and go up to 36.
- [ ] Both legal checkboxes are required and link to the permalinks returned by `GET /merchants/{publicKey}`; the terms are fetched again every time 2b mounts.
- [ ] 4242 tokenizes and moves to the summary stub showing `VISA •••• 4242`; a 422 shows "Revisa los datos de tu tarjeta…"; a 500 or network error shows "No pudimos validar tu tarjeta…".
- [ ] The test-mode note with 4242 and 4111 is always visible in 2b.

Sensitive data

- [ ] After a successful tokenization, neither `store.getState()` (including the `api` slice) nor `localStorage` contains the card number or the CVC (test).
- [ ] `localStorage` never contains the card token, `brand`/`last4` or the acceptance tokens (test).
- [ ] A refresh on the summary stub lands on 2b with an empty card form; closing and reopening the dialog does too.
- [ ] `tokenizeCard` is a plain function, and no RTK Query endpoint receives card data.
- [ ] No `console` output happens during tokenization (test).

Quality

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter @checkout/web test:cov` (≥ 80 % on all four metrics) exit 0.
- [ ] Chrome evidence at 375×667 and 1440×900 in `docs/evidence/checkout/`.
- [ ] `git diff main --stat` touches only `apps/web/src/features/checkout/**`, `apps/web/src/features/customer/**`, `apps/web/src/features/catalog/index.ts`, `apps/web/src/app/store.ts`, `apps/web/src/services/payment-gateway.ts` (+ spec), `apps/web/src/mocks/handlers/{payment-gateway.handlers.ts,index.ts}`, `docs/evidence/checkout/**` and `specs/`.
- [ ] A case-insensitive search for the payment provider's brand name in the branch diff returns no match.

## Decisions

Spec and branch

- **Yes:** SPEC 07, branch `spec-07-web-checkout` in its own worktree. SPEC 05 is blocking, because this spec replaces its dialog stub and extends its slice.
- **No:** `feat/03-web-checkout` from the phase file.
- **Yes:** one spec for both parts, one PR.
- **Yes:** sections written in one pass at the user's request, after the clarification round.

Flow

- **Yes:** two sub-steps inside the dialog (2a contact, 2b card), with `step` persisted. Shorter forms on mobile and one primary action per screen.
- **No:** one long form with a single "Continuar".
- **Yes:** after tokenizing, `step` becomes `SUMMARY`, and a stub `summary-sheet.tsx` is rendered. web 04 owns and replaces it, as SPEC 05 did with the dialog.
- **Yes:** the effective step is derived from the data (session and remembered details), not trusted from storage. One rule covers refresh, close and reopen, and product switch.

Amounts

- **Yes:** `getQuote` moves from web 04 into this spec, called as soon as a municipality is chosen, so the amount box shows the server total. web 04 reuses the endpoint.
- **No:** a client-side subtotal. Amounts are computed only on the server.
- **No:** an amount box without a total until the summary. It breaks "the amount leads".

Persistence

- **Yes:** customer and address are persisted only when "Recordarme" is checked on "Continuar". This deviates from the phase's R3, which persisted delivery data on every change.
- **No:** a persisted draft of the in-progress purchase. It would write the national ID, email and phone to `localStorage` without the customer asking.
- **Yes:** "Recordarme" stores customer and address, so the next purchase lands on 2b directly.
- **Yes:** the card token, `brand`, `last4` and the acceptance tokens live only in memory (`checkoutSession`). The card is always entered again after a refresh or after closing the dialog. This deviates from FR-21, which restored `{ token, brand, last4 }`.
- **No:** persisting the token with its `validity_ends_at`. We do not trust a stored token; the spike also advises a fresh token per charge attempt.
- **Yes:** a separate `checkoutSession` slice outside the persist whitelist. A test can assert that nothing sensitive reaches `localStorage`, and a new field cannot be persisted by accident.
- **No:** a nested `persistReducer` with a per-field blacklist (fragile), or React state in the dialog (web 04 could not read it).
- **Yes:** persist `version` 2 with a migration. redux-persist's level-1 merge would otherwise restore the old `checkout` object without `step`.
- **Yes:** closing the dialog keeps the contact details and drops the card and acceptance tokens. Reopening, for the same or another product, lands on 2b.

Gateway

- **Yes:** `tokenizeCard` is a plain `fetch` function called from the submit handler, with react-hook-form's `isSubmitting` as the loading state. RTK Query stores a mutation's `originalArgs` in Redux state and in its actions, which would put the card number and CVC in Redux.
- **No:** a TanStack Query `useMutation`. Its cache keeps `variables` too, with an extra dependency.
- **Yes:** the acceptance terms go through RTK Query (`queryFn`), since their only input is the public key; always refetched when 2b mounts, because the tokens are single-use.
- **No:** a second `createApi` for the gateway. It needs store and middleware changes and gains nothing.
- **Yes:** only the token, brand, last 4, installments and the two acceptance tokens are kept. Holder and expiry stay in the form, like the number and CVC.

Reuse and boundaries

- **Yes:** `isValidLuhn`, `detectCardBrand` and `checkExpiry` come from `@checkout/shared/validation`; only `lib/masks.ts` is new.
- **No:** `lib/luhn.ts` and `lib/card-brand.ts` in web, as the phase lists. They would duplicate tested code.
- **Yes:** the recipient is always the customer (`toDeliveryValues`). "Another person receives the order" is out of scope.
- **Yes:** a single new MSW handler file for the gateway, plus its registration. SPEC 05 kept `mocks/**` untouched; this is the only exception.
- **Yes:** `catalog/index.ts` exports `useGetProductQuery`, one line, so the dialog reads the product from the existing cache without importing catalog internals or changing the product page.

Errors and copy

- **Yes:** gateway 4xx → "Revisa los datos de tu tarjeta e inténtalo de nuevo."; network or 5xx → "No pudimos validar tu tarjeta. Inténtalo de nuevo en un momento."; terms error → "No pudimos cargar los términos y condiciones." + "Reintentar".
- **Yes:** quote `OUT_OF_STOCK` → "Solo quedan N unidades…" with a link to the product, and 2a "Continuar" disabled.

## Risks

| Risk | Mitigation |
| --- | --- |
| The spike recorded the acceptance token key paths but not the permalink key (`presigned_acceptance.permalink` assumed). | Step 6 checks the key paths with one real sandbox call (key names only, never values). If they differ, only the mapper changes. |
| The gateway's `brand` string differs from `CardBrand` (`VISA` / `MASTERCARD`). | `tokenizeCard` maps it explicitly; an unknown brand returns `INVALID_CARD` instead of storing a bad value. The step-6 sandbox check covers it. |
| The shadcn `Select` is hard to drive in Jest (portal, pointer events). | Tests use the helpers SPEC 03's `select.spec.tsx` already uses. If they do not reach, drive the select by keyboard. |
| The persist migration breaks a user's saved quantity from SPEC 05. | The migration only adds `step` and resets `customer`; it keeps `productId`, `quantity` and `isDialogOpen`. A test migrates a real version-1 value. |
| The CloudFront CSP blocks the gateway calls when deployed. | Out of scope here (infra). `docs/design/04-aws-architecture.md` already lists the sandbox in `connect-src`; checkpoint C2 or the deploy check catches it. |
| A card field is logged by an error path (e.g. `fetch` rejection with the body). | `tokenizeCard` catches every error and returns a reason without the input; a `console` spy test covers success and every failure. |
| SPEC 05's final dialog stub or slice uses different names than assumed. | Adapt the names, not the shape; the SPEC 05 decisions already fix `startCheckout`, `closeCheckout` and `selectIsCheckoutOpen`. |
| SPEC 06 changes the quote contract. | Both specs consume `Quote` from `@checkout/shared/contracts`; drift fails `typecheck`. |

## What is **not** in this spec

- Summary content, `upsertCustomer`, `createTransaction`, idempotency and payment errors (web 04).
- New acceptance tokens after a failed payment, and clearing the session after a final status (web 04).
- A separate recipient, saved cards, or restoring a card token after a refresh.
- The CloudFront CSP (infra).
- Any change to `services/api.ts`, `components/ui`, `components/layout`, the router, other `mocks/**` files, `packages/shared`, `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

Each of these, if it lands, goes in its own spec.
