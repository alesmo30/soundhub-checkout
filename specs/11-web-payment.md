# SPEC 11 — Web: payment (summary, pay and final status)

> **Status:** Approved
> **Depends on:** SPEC 07 (checkout forms, `checkoutSession`, `summary-sheet` stub), SPEC 05 (catalog product cache and `invalidateProduct`). Runs against MSW, in parallel with SPEC 08 and SPEC 10; checkpoint C3 runs after all three merge.
> **Date:** 2026-09-27
> **Objective:** The customer sees exactly what will be charged, pays once — a retry, a refresh mid-payment or a changed price never double-charges — and follows the real outcome on `/transactions/:id`, even after a refresh or from a shared link, before returning to the product with fresh stock.

> Source phase: `phases/sunday/web/04-payment.md` (Part 1 summary and pay, Part 2 final status page).
> SPEC 08 (api create transaction), SPEC 09 (infra first deploy) and SPEC 10 (api status and finalization) already hold those numbers, so this spec takes 11.

## Scope

**In:**

Part 1 — summary and pay (step 3, `features/checkout`)

- `checkout.api.ts` gains two mutations:
  - `upsertCustomer` (`POST /customers`);
  - `createTransaction` (`POST /transactions`). It sends the `Idempotency-Key` header and reads `Idempotent-Replayed`.
- `summary-sheet.tsx` replaces SPEC 07's stub with a **layer on top of** the checkout dialog: a `Drawer` (bottom sheet) below `md` and a `Dialog` from `md`. It shows:
  - product × quantity;
  - subtotal with "IVA incluido";
  - the payment gateway's commission ("Comisión de la pasarela de pago");
  - delivery fee with its label;
  - the total at 36/700;
  - the masked card;
  - the delivery address;
  - "Editar" and "Pagar $ …".

  Every amount comes from `GET /quotes` (fetched fresh when the summary opens), never from local math.
- **Idempotency key:**
  - It lives in `checkoutSession` (memory) and is created when the summary opens.
  - It is **reused** on "Reintentar" after an uncertain failure (network error, timeout, 5xx).
  - It is **rotated** whenever the request body changes: "Editar", a re-quote after `PRICE_CHANGED`, a corrected contact.
  - It is **discarded** after a 201.
- **Pending payment in `sessionStorage`:**
  - Right before `POST /transactions`, `{ idempotencyKey, body, savedAt }` is written under `soundhub:pending-payment`.
  - Any definitive response clears it: 201, 400, 409, 422, 429 or 503.
  - After a refresh, `PendingPaymentRecovery` (mounted at the router root) finds the entry and shows "Recuperando tu pago…". It re-sends the exact same key and body, and on 201 navigates to `/transactions/:id`. The backend replays the transaction if it had been created, so there is only one charge.
- **Pay flow** (`hooks/use-checkout-flow.ts`): `upsertCustomer` → write the pending entry → `createTransaction` → handle the outcome by error `code`, per the error table in the data model.
  - The pay button is disabled while the request is in flight, labelled "Procesando pago…".
  - On 201 (any status, including `ERROR`):
    - clear the pending entry and the key;
    - `closeCheckout` (it drops the used card and acceptance tokens);
    - navigate to `/transactions/:id`.
- `contact-form.tsx` (a SPEC 07 file, minimal change):
  - it shows a server-side field error on the email field;
  - its "Continuar" goes straight to `SUMMARY` when a tokenized card is still in the session, and to `CARD` otherwise.

Part 2 — final status page (steps 4–5, `features/transaction`)

- `transaction.api.ts`: `getTransaction(id)` returns the `TransactionView` plus the `Retry-After` header in milliseconds.
- `hooks/use-transaction-polling.ts` polls every `Retry-After` (default `POLL_INTERVAL_MS`) until a final status, inside a `POLL_TIMEOUT_MS` window.
  - Transient errors (network, 5xx including 504, 429) are ignored and polling continues.
  - A 404 or 400 stops polling with "No encontramos este pago".
  - After the window: "Pago en verificación. Te avisaremos por correo." with an "Actualizar" button that opens another 60 s window.
  - A refresh or a shared link starts polling from the URL alone.
- `pages/transaction-status-page.tsx`, per `DESIGN.md` §4:
  - a large circular icon (APPROVED: `brand-mint` + `brand-forest`; DECLINED / ERROR / VOIDED / EXPIRED: `danger`; PENDING and under review: `warning` + spinner);
  - title;
  - monospace reference;
  - breakdown;
  - masked card;
  - delivery status;
  - all of it wrapped in `aria-live="polite"`.
- Actions:
  - APPROVED: "Volver al producto".
  - Failed statuses: "Intentar con otra tarjeta" (primary) reopens the checkout on the product at the `CARD` step, with the same quantity, the contact kept, and a fresh card and acceptance tokens. "Volver al producto" is the secondary link.
  - "Volver al producto" invalidates the product cache, resets the `checkout` slice and clears `checkoutSession`, and keeps the remembered customer data if it was opted in.
- `app/router.tsx` swaps `TransactionPlaceholderPage` for `TransactionStatusPage`, and mounts `PendingPaymentRecovery`.

Wiring and close-out

- MSW: POST outcomes by card token and by scenario; GET fixtures for every status; and a "progressing" transaction that answers PENDING (with `Retry-After: 2`) twice, then APPROVED.
- Chrome evidence at 375×667 and 1440×900 in `docs/evidence/payment/`.

**Out of scope (for future specs):**

- A `beforeunload` "your payment is processing" warning.
- Persisting the `transactionId` in redux-persist, and a "payment in progress" banner on the product page.
- A backend lookup by idempotency key (`GET /transactions?idempotencyKey=`).
- Showing the gateway's raw `statusMessage` to the customer.
- Calling `GET /deliveries/:id` from the status page (the view's `delivery.status` is enough).
- Toasts or notices on the catalog pages.
- Playwright end-to-end tests (web 08) and responsive polish across the app (web 07).
- Checkpoint C3 against the real API and sandbox.
- Any change to `packages/shared`, `services/api.ts`, `components/ui/**`, `components/layout/**`, the card form, the persist version, `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

## Data model

No database, contract or persist-version changes. Server shapes come from `@checkout/shared/contracts` (`Quote`, `UpsertCustomerRequest`, `Customer`, `CreateTransactionRequest`, `TransactionCreated`, `TransactionView`). Header names come from `IDEMPOTENCY_KEY_HEADER` and `IDEMPOTENT_REPLAYED_HEADER`.

### Files

```
apps/web/src/
├─ app/router.tsx                           ~ /transactions/:id → TransactionStatusPage · <PendingPaymentRecovery /> at the root
├─ app/placeholder-pages.tsx                − TransactionPlaceholderPage (NotFoundPage stays)
├─ mocks/
│  ├─ fixtures/transaction.ts               + one TransactionView per status · a "progressing" id · created fixtures per outcome
│  └─ handlers/transactions.handlers.ts     ~ POST outcome by token / scenario · GET by id · Retry-After on PENDING
└─ features/
   ├─ checkout/
   │  ├─ index.ts                           + resetCheckout, PendingPaymentRecovery, payment actions
   │  ├─ checkout.api.ts                    + upsertCustomer, createTransaction
   │  ├─ checkout.slice.ts                  + resetCheckout
   │  ├─ checkout-session.slice.ts          + idempotencyKey, paymentProblem, contactFieldError (+ actions)
   │  ├─ checkout.constants.ts              + FEE_RULE_LABEL, payment copy
   │  ├─ lib/
   │  │  pending-payment.ts                 read / write / clear the sessionStorage entry
   │  │  payment-outcome.ts                 ErrorCode → outcome (pure)
   │  ├─ hooks/
   │  │  use-checkout-flow.ts               pay() and retry() orchestration
   │  │  use-is-desktop.ts                  matchMedia('(min-width: 768px)')
   │  └─ components/
   │     summary-sheet.tsx                  Drawer / Dialog layer (replaces the stub)
   │     summary-breakdown.tsx              rows from the quote
   │     payment-problem.tsx                role="alert" message + its action
   │     pending-payment-recovery.tsx       "Recuperando tu pago…" overlay
   │     checkout-dialog.tsx                ~ renders CardForm under the summary layer on SUMMARY
   │     contact-form.tsx                   ~ server field error · Continuar → SUMMARY when a card exists
   └─ transaction/
      ├─ index.ts                           TransactionStatusPage
      ├─ transaction.api.ts                 getTransaction
      ├─ transaction.constants.ts           STATUS_COPY, DELIVERY_STATUS_LABEL
      ├─ hooks/use-transaction-polling.ts
      ├─ pages/transaction-status-page.tsx
      └─ components/
         status-hero.tsx · transaction-breakdown.tsx · status-actions.tsx · transaction-not-found.tsx
```

Tests are `*.spec.ts(x)` next to each file, as `apps/web/jest.config.js` requires.

### `checkoutSession` additions (memory only)

```ts
type PaymentProblem =
  | { kind: 'PRICE_CHANGED'; previousTotalInCents: number }
  | { kind: 'OUT_OF_STOCK' }
  | { kind: 'UNAVAILABLE' }        // 503: nothing created, same key may be reused
  | { kind: 'RATE_LIMITED' }       // 429
  | { kind: 'UNCERTAIN' }          // network / timeout / 5xx: the pending entry stays, "Reintentar" re-sends it
  | { kind: 'FAILED' };            // 400 / 422 / anything else: nothing created, key rotated

interface ContactFieldError { field: 'email'; code: 'EMAIL_ALREADY_REGISTERED' | 'CUSTOMER_DATA_MISMATCH' }

interface CheckoutSessionState {
  // …SPEC 07 fields
  idempotencyKey: string | null;      // created when the summary opens, rotated when the body changes
  paymentProblem: PaymentProblem | null;
  contactFieldError: ContactFieldError | null;
}
ensureIdempotencyKey()   // sets crypto.randomUUID() only when null
rotateIdempotencyKey()   // always a new uuid
setPaymentProblem(problem | null)
setContactFieldError(error | null)
// extraReducers: closeCheckout also clears idempotencyKey and paymentProblem
```

### `checkout` slice addition (persisted, same shape)

```ts
resetCheckout()   // back to initialState: productId null, quantity 1, dialog closed, step CONTACT
```

### Pending payment (`lib/pending-payment.ts`)

```ts
const PENDING_PAYMENT_KEY = 'soundhub:pending-payment';

interface PendingPayment {
  idempotencyKey: string;
  body: CreateTransactionRequest;     // byte-for-byte what was sent: the backend hash must match
  savedAt: string;                    // ISO, for diagnostics only
}
readPendingPayment(): PendingPayment | null    // malformed JSON or shape → clears it, returns null
writePendingPayment(entry): void
clearPendingPayment(): void
// every access wrapped in try/catch; storage unavailable → behaves as "no entry"
```

The card number and CVC are never in the entry. It holds the single-use card token, the acceptance tokens and the delivery contact, only in this tab, and only between the click and the response.

### Endpoints

```ts
// checkout.api.ts
upsertCustomer: mutation<Customer, UpsertCustomerRequest>
//   POST /customers · transformResponse unwraps data
createTransaction: mutation<{ transaction: TransactionCreated; replayed: boolean },
                            { idempotencyKey: string; body: CreateTransactionRequest }>
//   POST /transactions · header Idempotency-Key · replayed = response header Idempotent-Replayed === 'true'

// transaction.api.ts
getTransaction: query<{ view: TransactionView; retryAfterMs: number | null }, string>
//   GET /transactions/:id · retryAfterMs from the Retry-After header (seconds × 1000), null when absent
```

### Outcome table (`lib/payment-outcome.ts` + `use-checkout-flow.ts`)

| Response | Outcome | Key | Pending entry | What the customer sees |
|---|---|---|---|---|
| `POST /transactions` 201 (any status) | navigate to `/transactions/:id` | discarded | cleared | status page |
| 409 `PRICE_CHANGED` | re-quote | rotated | cleared | "El total cambió de $ X a $ Y. Revisa el nuevo valor antes de pagar." New total highlighted; "Pagar $ Y" enabled |
| 409 `OUT_OF_STOCK` | invalidate product | rotated | cleared | "Ya no hay unidades suficientes para tu pedido. No se hizo ningún cobro." + "Ajustar cantidad" (closes the dialog); "Pagar" hidden |
| `POST /customers` 409 `EMAIL_ALREADY_REGISTERED` | close the summary, step `CONTACT` | rotated | — | email field: "Este correo ya está registrado con otro documento. Usa otro correo." |
| `POST /customers` 409 `CUSTOMER_DATA_MISMATCH` | close the summary, step `CONTACT` | rotated | — | email field: "Este documento ya está registrado con otro correo. Usa el correo con el que compraste antes." |
| 503 `PAYMENT_GATEWAY_UNAVAILABLE` | stay | kept | cleared | "Los pagos no están disponibles en este momento. Inténtalo de nuevo en unos segundos." |
| 429 `RATE_LIMITED` | stay | kept | cleared | "Hiciste demasiados intentos. Espera un momento e inténtalo de nuevo." |
| network error, timeout, 5xx | stay | kept | **kept** | "No pudimos confirmar tu pago. No pagues de nuevo: toca Reintentar para verificarlo." + "Reintentar" (re-sends the entry); "Editar" hidden |
| 400 / 422 / other | stay | rotated | cleared | "No pudimos procesar tu pago. No se hizo ningún cobro." |

`PendingPaymentRecovery` uses the same table. When a definitive non-201 arrives after a refresh, the card is gone. The overlay then closes, the checkout dialog shows its usual step, and a one-time notice appears: "Tu pago anterior no se completó y no se hizo ningún cobro. Ingresa tu tarjeta de nuevo."

### Copy (`checkout.constants.ts`, `transaction.constants.ts`)

```ts
FEE_RULE_LABEL = {
  FREE_METRO: 'Envío gratis',
  METRO_FLAT: 'Envío área metropolitana',
  NATIONAL_DISTANCE: 'Envío nacional',            // + ` · ${distanceKm} km`
};

STATUS_COPY = {
  APPROVED: { title: '¡Pago aprobado!', tone: 'success' },
  DECLINED: { title: 'Tu pago fue rechazado', tone: 'danger' },
  ERROR:    { title: 'No pudimos procesar tu pago', tone: 'danger' },
  VOIDED:   { title: 'El pago fue anulado', tone: 'danger' },
  EXPIRED:  { title: 'El pago expiró', tone: 'danger' },
  PENDING:  { title: 'Procesando tu pago…', tone: 'warning' },
};
UNDER_REVIEW_COPY = 'Pago en verificación. Te avisaremos por correo.';
DELIVERY_STATUS_LABEL = { AWAITING_PAYMENT: 'Esperando pago', READY_TO_SHIP: 'Listo para envío', CANCELLED: 'Cancelado' };
```

### Polling state (`use-transaction-polling.ts`)

```ts
type PollingState =
  | { phase: 'loading' }
  | { phase: 'pending'; view: TransactionView }        // inside the window
  | { phase: 'final'; view: TransactionView }
  | { phase: 'under-review'; view: TransactionView | null; restart(): void }   // window elapsed
  | { phase: 'not-found' };                             // 404 or 400
// RTK Query pollingInterval = retryAfterMs ?? POLL_INTERVAL_MS while pending, 0 otherwise.
// Window: POLL_TIMEOUT_MS from mount or from the last restart().
```

### MSW (dev and tests)

| Request | Response |
|---|---|
| `POST */customers` | 201, as today; tests override for both 409s |
| `POST */transactions`, token from card 4242 | 201 PENDING, id `…progressing` |
| `POST */transactions`, token from card 4111 | 201 PENDING, id `…declined-progressing` |
| `GET */transactions/…progressing` | PENDING + `Retry-After: 2` on the first 2 calls, then APPROVED |
| `GET */transactions/…declined-progressing` | PENDING + `Retry-After: 2` twice, then DECLINED |
| `GET */transactions/<status fixture id>` | the fixed view for APPROVED, DECLINED, ERROR, VOIDED, EXPIRED, or an endless PENDING |
| `GET */transactions/<unknown uuid>` | 404 `TRANSACTION_NOT_FOUND` |

The progressing counters live in the handler module and are reset in `afterEach`. Chrome evidence visits each fixture id directly.

## Implementation plan

Prerequisites (not commits):

- SPEC 07 is merged (it is). `/spec-impl` creates `spec-11-web-payment` from `main`.
- `pnpm dev` runs the web app against MSW. No API, database or sandbox keys are needed.

Each step is one commit after review. Frontend steps save Chrome screenshots at 375×667 and 1440×900 to `docs/evidence/payment/` before the step summary. Target: ≤ ~300 changed lines per step. Pushing and opening PRs happen only when the user asks.

### Part 1 — summary and pay

1. [x] **Payment endpoints and MSW scenarios.** Add `upsertCustomer` and `createTransaction` to `checkout.api.ts`, the new transaction fixtures, and the POST/GET scenario handlers (the progressing counters included). The specs, over MSW, cover:
   - the `Idempotency-Key` header is sent;
   - `replayed` is true when `Idempotent-Replayed: true` comes back;
   - `upsertCustomer` unwraps `data`;
   - each fixture id answers with its status, and the progressing id answers PENDING, PENDING, APPROVED.

   Manual test: `pnpm --filter @checkout/web test` green.
   Commit: `feat(web): add payment endpoints and MSW payment scenarios`.

2. [x] **Session payment state and pending entry.** `checkoutSession` gains `idempotencyKey`, `paymentProblem`, `contactFieldError` and their actions. `checkout` gains `resetCheckout`. Add `lib/pending-payment.ts` and `lib/payment-outcome.ts`. The specs cover:
   - `ensureIdempotencyKey` keeps an existing key, and `rotateIdempotencyKey` replaces it;
   - `closeCheckout` clears the key and the problem;
   - the pending entry round-trips through `sessionStorage`;
   - a malformed entry is cleared and read as null;
   - a throwing storage behaves as "no entry";
   - `payment-outcome` maps every row of the outcome table.

   Manual test: `test` green.
   Commit: `feat(web): add payment session state and pending payment storage`.

3. [x] **Pay flow hook.** `hooks/use-checkout-flow.ts` with `pay()` and `retry()`. It builds the body from the session, the checkout slice and `toDeliveryValues`, and uses the quote's total as `expectedTotalInCents`. The `renderHook` + MSW specs cover:
   - the call order `upsertCustomer` → pending entry written → `createTransaction`;
   - 201 → entry cleared, `closeCheckout`, navigation to `/transactions/:id`;
   - a replayed 201 behaves the same;
   - `PRICE_CHANGED` → re-quote, `previousTotalInCents` kept, key rotated;
   - `OUT_OF_STOCK` → `invalidateProduct` dispatched, key rotated;
   - both customer 409s → step `CONTACT`, `contactFieldError` set, `createTransaction` never called;
   - 503 and 429 → entry cleared, key kept;
   - a network error → entry kept, `retry()` re-sends the **same key and body**, and a second 201 navigates;
   - 400 / 422 → key rotated;
   - `pay()` is a no-op while a request is in flight.

   Manual test: `test` green.
   Commit: `feat(web): add pay flow with idempotent retry`.

4. [x] **Summary layer.** `summary-sheet.tsx` (a `Drawer` below `md`, a `Dialog` from `md`, chosen by `use-is-desktop.ts`), `summary-breakdown.tsx`, `payment-problem.tsx`, and `checkout-dialog.tsx` rendering the card step under the layer on `SUMMARY`. The component specs cover:
   - every amount is rendered from the quote fixture with `formatCop`, including "IVA incluido" and each `FEE_RULE_LABEL`;
   - the masked card `•••• 4242` and the address with the municipality name;
   - "Editar" → step `CARD` and a rotated key;
   - "Pagar $ …" is disabled while the quote loads and while paying ("Procesando pago…");
   - each `paymentProblem` renders its copy and action (the price change highlights the new total, the out-of-stock case hides "Pagar", the uncertain case shows only "Reintentar");
   - Esc closes only the summary layer.

   Decision: the base fee (`baseFeeInCents`) row stays in the summary — hiding it was tried and reverted, because then the subtotal and delivery rows no longer add up to the total with no visible reason, which reads worse than a named fee (an unexplained gap looks like a hidden charge; a labelled one doesn't). Its label is "Comisión de la pasarela de pago" instead of "Costo base", so the customer understands what it is without the payment gateway's brand name appearing (forbidden by CLAUDE.md; "pasarela de pago" is the generic term already used elsewhere in this codebase). Same label in Part 2's `transaction-breakdown.tsx` (step 8).

   Manual test: in Chrome, both viewports, the drawer on mobile, the dialog on desktop, and the price-changed and out-of-stock states (MSW overrides from the browser console). Screenshots saved.
   Commit: `feat(web): render the payment summary as a sheet and dialog`.

5. [x] **Contact form server errors.** `contact-form.tsx` sets `contactFieldError` on the email field (linked with `aria-describedby`) and clears it on submit. "Continuar" goes to `SUMMARY` when a card is in the session, and to `CARD` otherwise. The specs cover:
   - both messages;
   - the error clears after editing and submitting;
   - with a card → `SUMMARY`, without → `CARD`.

   Manual test: in Chrome, both viewports, the email error after a mocked 409. Screenshots saved.
   Commit: `feat(web): highlight customer conflicts on the contact form`.

6. [x] **Pending payment recovery.** `pending-payment-recovery.tsx` is mounted at the router root and exported from `checkout/index.ts`. On mount with an entry, it shows the "Recuperando tu pago…" overlay (`aria-live`) and re-sends it. The specs simulate a refresh by writing an entry and rendering the app, and cover:
   - the POST carries the stored key and a byte-identical body;
   - 201 → navigation and the entry cleared;
   - a definitive 409 → the entry cleared and the one-time notice shown;
   - a network error → "No pudimos confirmar tu pago" + "Reintentar", and the entry kept;
   - no entry → renders nothing and sends nothing.

   Manual test: in Chrome, click "Pagar" with a delayed MSW response, refresh, and see the overlay, then the status page. Screenshots saved.
   Commit: `feat(web): recover an in-flight payment after a refresh`.

### Part 2 — final status

7. [x] **Transaction API and polling hook.** `transaction.api.ts` and `use-transaction-polling.ts`. The fake-timer specs cover:
   - PENDING → APPROVED on the progressing id, with a request every 2 s;
   - PENDING → DECLINED;
   - a `Retry-After: 5` response waits 5 s;
   - a 504 in the middle is ignored and polling continues;
   - a 404 → `not-found` with no further requests;
   - 60 s of PENDING → `under-review`, and `restart()` opens a new window;
   - a remount (simulated refresh) starts polling again from the id alone.

   Manual test: `test` green.
   Commit: `feat(web): poll transaction status honoring Retry-After`.

8. [x] **Status page.** `transaction-status-page.tsx`, `status-hero.tsx`, `transaction-breakdown.tsx`, `transaction-not-found.tsx` and `transaction.constants.ts`, with the router swap (and the placeholder removed). The specs cover:
   - each status renders its title, tone and icon;
   - the monospace reference, the breakdown with `formatCop`, `•••• 4242` and the delivery status label;
   - the region has `aria-live="polite"`;
   - `under-review` shows its copy and "Actualizar";
   - `not-found` shows its page;
   - the raw `statusMessage` is never rendered.

   Manual test: in Chrome, both viewports, every status fixture id, the progressing id (PENDING, then APPROVED), and an unknown id. Screenshots saved.
   Commit: `feat(web): add the final transaction status page`.

9. [ ] **Status actions.** `status-actions.tsx`:
   - "Volver al producto" dispatches `invalidateProduct`, `resetCheckout` and `clearCheckoutSession`, then navigates to `/products/:productId`;
   - "Intentar con otra tarjeta" dispatches `invalidateProduct`, `closeCheckout` (it drops the card), `startCheckout({ productId, quantity })` and `goToStep('CARD')`, then navigates.

   The specs cover:
   - APPROVED shows only "Volver al producto", and failed statuses show both;
   - after "Volver al producto", the product query refetches (MSW sees a second `GET /products/:id`), the dialog is closed, and the remembered customer is kept;
   - after "Intentar con otra tarjeta", the dialog is open on `CARD` with the contact kept.

   Manual test: in Chrome, both viewports, 4111 → DECLINED → "Intentar con otra tarjeta" → 4242 → APPROVED → "Volver al producto" with the stock refreshed. Screenshots saved.
   Commit: `feat(web): return to the product or retry from the status page`.

### Close-out

10. [ ] **Coverage, evidence and CI.**
    - `pnpm lint`, `pnpm typecheck` and `pnpm --filter @checkout/web test:cov` are green, with coverage ≥ 80 % on all four metrics.
    - `docs/evidence/payment/` holds every screenshot listed in the acceptance criteria.
    - When the user asks, push and open the PR with `gh-cli`, wait for CI, and fix whatever fails.
    - Finally, mark this spec `Implemented`.

    Manual test: every check green.
    Commit: `docs: mark spec 11 as Implemented`.

Notes:

- A CI fix in step 10 goes in its own `fix: …` commit, after review.
- If a `packages/shared` contract turns out to be wrong, stop and apply the contract-change protocol.
- Checkpoint C3 (real API and sandbox) runs after SPEC 08, 10 and 11 merge. It is not part of this spec.

## Acceptance criteria

Summary

- [ ] Below `md` the summary is a bottom sheet (`Drawer`). From `md` it is a `Dialog` on top of the checkout dialog, and Esc closes only the summary.
- [ ] Every amount shown comes from the `GET /quotes` response. A spec with a quote fixture of unusual values shows exactly those values.
- [ ] The summary shows product × quantity, the subtotal with "IVA incluido", the payment gateway's commission labelled "Comisión de la pasarela de pago", the delivery fee with its `FEE_RULE_LABEL`, the total at 36/700, `•••• <last4>` and the address with its municipality name.
- [ ] "Editar" returns to the card step and rotates the idempotency key.

Pay and idempotency

- [ ] "Pagar" calls `POST /customers` and then `POST /transactions` with `expectedTotalInCents` equal to the quote's total and an `Idempotency-Key` uuid.
- [ ] The pay button is disabled, labelled "Procesando pago…", while a request is in flight. A double click sends one request.
- [ ] After a network error, "Reintentar" sends the same key and a byte-identical body.
- [ ] After a simulated refresh with a pending entry, the app re-sends it with the same key and body, and lands on `/transactions/:id` (spec with a stored entry).
- [ ] A 201 always navigates to `/transactions/:id`, also with `status: "ERROR"` and on a replay.
- [ ] The pending entry exists only in `sessionStorage`, never contains a card number or CVC, and is gone after any definitive response.
- [ ] No card number or CVC appears in Redux, `localStorage` or any request to the API.

Errors

- [ ] `PRICE_CHANGED` shows the old and the new total, re-enables "Pagar $ <new>", and the next attempt uses a new key.
- [ ] `OUT_OF_STOCK` shows the no-stock message, hides "Pagar", and "Ajustar cantidad" closes the dialog with the product refetched.
- [ ] `EMAIL_ALREADY_REGISTERED` and `CUSTOMER_DATA_MISMATCH` return to "Tus datos" with the email field in error and its message. After correcting it, "Continuar" goes straight to the summary.
- [ ] 503 and 429 show their messages, and "Pagar" can be used again.

Final status

- [ ] `/transactions/:id` polls every `Retry-After` seconds (2 by default), and stops at the first final status.
- [ ] A 504 or network error during polling does not change what the customer sees.
- [ ] After 60 s of PENDING, "Pago en verificación. Te avisaremos por correo." and "Actualizar" appear, and "Actualizar" resumes polling.
- [ ] An unknown or malformed id shows "No encontramos este pago".
- [ ] Each status shows its `STATUS_COPY` title and tone, the monospace reference, the breakdown, `•••• <last4>` and the delivery status label, inside `aria-live="polite"`.
- [ ] Opening `/transactions/:id` in a fresh tab (a shared link or a refresh) shows the same result with no stored state.
- [ ] "Volver al producto" lands on the product with a refetched stock, the dialog closed, and the remembered customer kept.
- [ ] "Intentar con otra tarjeta" lands on the product with the checkout open on the card step and the contact kept.

Quality and evidence

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter @checkout/web test:cov` exit 0, with `apps/web` ≥ 80 % on statements, branches, functions and lines.
- [ ] `docs/evidence/payment/` has screenshots at 375×667 and 1440×900 of:
  - the summary (sheet and dialog);
  - price changed, out of stock, the customer email error and paying in flight;
  - recovering after a refresh;
  - the status page for PENDING, APPROVED, DECLINED, ERROR, VOIDED, EXPIRED, under review and not found.
- [ ] `packages/shared`, `services/api.ts`, `components/ui/**`, `components/layout/**`, `card-form.tsx` and `PERSIST_VERSION` are unchanged.
- [ ] The PR shows green `lint`, `typecheck` and `coverage (web)`.

## Decisions

Spec and branch

- **Yes:** one spec with Part 1 (summary and pay) and Part 2 (status page), one branch `spec-11-web-payment` and one PR, like SPEC 07 and the phase file.
- **No:** two specs (11 and 12) in parallel worktrees. That would mean two PRs, a placeholder after paying until both merge, and a second clarification round.
- **No:** `feat/04-web-payment` from the phase file. Earlier specs settled on `spec-NN-slug`.
- **Yes:** it starts now, against MSW. It does not wait for SPEC 08 or 10. C3 checks the real integration later.
- **Yes:** the clarification ran question by question, and the sections after the header were written in one pass at the user's request.

Idempotency and recovery

- **Yes:** the key lives in `checkoutSession` (memory). It is created when the summary opens, reused on "Reintentar" after an uncertain failure, rotated whenever the body changes, and discarded after a 201.
- **Yes:** at "Pagar", `{ key, body }` goes to `sessionStorage`, and after a refresh the same pair is re-sent automatically. If Ana refreshes while the gateway is processing, the backend replays the transaction it already created, and she lands on its status page with one charge.
- **No (deviation from the phase's "persisted key" and FR-22's "persisted transactionId"):** persisting only the key in redux-persist. The backend recognises a key only together with the exact body, and the body holds single-use card and acceptance tokens that a refresh erases. A persisted key alone could never find the payment, and reusing it with a new body returns 422.
- **No:** a backend lookup by key (`GET /transactions?idempotencyKey=`). It changes the API and the shared contract, needs its own spec, and would block this one.
- **No:** storing nothing and relying on a `beforeunload` warning and the email. Ana would not see her result on screen after a refresh. The warning was not chosen as a second layer either.
- **No:** a new key per click. After a lost response, a second click would create a second transaction and reserve stock twice.
- **Yes:** `sessionStorage` rather than `localStorage`. It survives a refresh, dies with the tab, holds the entry only for the seconds of the request, and needs no persist migration.
- **Yes, accepted trade-off:** the pending entry briefly holds the single-use card token, the acceptance tokens and the delivery contact, even without "Recordarme". CLAUDE.md forbids storing the card number and CVC, not the token.
- **Yes:** while an uncertain entry exists, the summary offers only "Reintentar". Editing and paying with a new key could charge twice if the first attempt went through.
- **No:** persisting the `transactionId` and a "payment in progress" banner on the product page. The URL already carries the id for a refresh or a shared link, the pre-201 gap is covered by the pending entry, and the banner would touch the catalog and need a persist migration.

Errors

- **Yes:** `PRICE_CHANGED` shows the old and the new total and waits for a new click, with a new key. Nobody is charged an amount they did not see. It is unlikely in this challenge, but real in production, and costs only one MSW spec.
- **No:** re-paying automatically with the new total, or sending the customer back to the forms.
- **Yes:** `OUT_OF_STOCK` is explained inside the summary, with "Ajustar cantidad" closing the dialog over a refetched product. This follows SPEC 07's amount-box pattern and stays inside `features/checkout`.
- **No:** closing the dialog at once and showing a notice on the product page. There is no toast component, it would touch `features/catalog`, and a sudden close disorients.
- **Yes:** both customer conflicts highlight the **email**, with a message per code. The national ID is the identity, and the email is what the customer can fix. After correcting it, "Continuar" jumps back to the summary because the unused card token is still in the session.
- **No:** routing through the card step after the correction. The customer would type a card number again that was still valid.
- **Yes:** 503 and 429 keep the key. Nothing was created, so the same key and body are safe to send again.

Summary layout

- **Yes:** the summary is a layer on top of the checkout dialog, a `Drawer` on mobile and a `Dialog` on desktop, as `DESIGN.md` §4 and the phase require.
- **No:** rendering the summary inside the checkout dialog's right panel (SPEC 07's stub). It is simpler, but it breaks the design and the phase's "sheet on mobile, dialog on desktop" evidence.
- **Yes:** `contact-form.tsx` is touched minimally (server field error, and "Continuar" to `SUMMARY` when a card exists), although the phase lists the forms under "must not touch". The customer-conflict flow needs it. The card form is not touched.

Final status

- **Yes:** "Intentar con otra tarjeta" reopens the checkout on the card step, with the same quantity and the contact kept. "Volver al producto" is the secondary link and does what the phase says.
- **No:** a single "Volver al producto" that starts from scratch. It adds friction right after a rejection.
- **Yes:** transient poll errors (network, 5xx including the 504 that SPEC 10 accepted as a risk, 429) are ignored. 404 and 400 stop polling.
- **No:** an error screen on any poll error. A lone 504 would scare a customer whose payment is fine, and might make them pay again.
- **Yes:** "Actualizar" after the 60 s window opens another 60 s window instead of making a single request.
- **Yes:** the status page chooses its copy by status and never renders the gateway's raw `statusMessage` (`DESIGN.md` §6: the UI chooses messages by code, not by text).
- **Yes:** the delivery status comes from `TransactionView.delivery.status`. `GET /deliveries/:id` is not called.

Testing and evidence

- **Yes:** MSW scenarios keyed by card token and fixture id, including a "progressing" id (PENDING twice, then a final status). Chrome evidence can then reach every state without the real API.

## Risks

| Risk | Mitigation |
| --- | --- |
| The recovery re-sends a body that differs by one byte from the original (key order, an `undefined` field), and the backend answers 422 `IDEMPOTENCY_KEY_REUSED`. | The entry stores the exact object passed to `createTransaction`, and the recovery sends that object without rebuilding it. A spec asserts a byte-identical JSON body. The backend hashes with sorted keys (SPEC 08), which absorbs key order anyway. |
| After a refresh, the recovery sends a card token that was never used, so a payment is created without the customer clicking again. | Accepted: the customer did click "Pagar" for exactly that body, and the overlay says "Recuperando tu pago…". The entry dies with the tab. |
| A stale entry survives in the tab (for example, the API was down for minutes). The token or the acceptance tokens have expired, so the recovery gets 201 `ERROR`. | The status page shows the ERROR state with "Intentar con otra tarjeta". No charge happens with an expired token. |
| Two stacked modal layers (Dialog + Drawer or Dialog) fight over focus or Esc. | Radix and vaul support nesting. A spec asserts Esc closes only the summary, and Chrome evidence checks the focus ring on both viewports. |
| MSW scenario counters leak between tests and make polling specs flaky. | The counters are reset in `afterEach`, and the polling specs use fake timers with explicit advances. |
| The real API differs from the MSW fixtures (the `Retry-After` format, a 201 body field). | Fixtures are typed with the shared contracts, and checkpoint C3 runs the flow against SPEC 08 and 10 with the sandbox. |
| `sessionStorage` is unavailable (privacy mode, blocked storage). | Every access is in try/catch. Payment still works; only the refresh recovery is lost. |
| Frequent polling from many open tabs. | It stops at the first final status and after 60 s. The backend's breaker protects the gateway (SPEC 10). |

## What is **not** in this spec

- The `beforeunload` warning.
- A persisted `transactionId`, and a "payment in progress" banner.
- A backend lookup by idempotency key.
- Rendering the gateway's raw `statusMessage`.
- Calling `GET /deliveries/:id` from the web.
- Toasts or notices on catalog pages.
- Playwright end-to-end tests (web 08) and app-wide responsive polish (web 07).
- Checkpoint C3 against the real API and sandbox.
- Changes to `packages/shared`, `services/api.ts`, `components/ui/**`, `components/layout/**`, the card form, the persist version, `docs/design/`, `requirements/`, `references/`, `phases/`, the `CLAUDE.md` files or `apps/web/DESIGN.md`.

Each of these, if it lands, goes in its own spec.
