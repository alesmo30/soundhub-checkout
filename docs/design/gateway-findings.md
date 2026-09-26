# Payment gateway sandbox — spike findings

> Source: `scripts/gateway-spike.ts`, one full run recorded on 2026-09-26.
> Node version: v26.3.0. All 5 scenarios executed, exit code `0`.
> No real ids, tokens, references or URL appear below — only key paths,
> status trails, HTTP codes and error shapes, as printed by the script.

## Run context

- Date: 2026-09-26.
- Node: v26.3.0 (`--env-file` flag used directly, no fallback needed — see
  Risks in the spec).
- Scenarios executed, in order: `approved`, `declined`, `invalid-token`,
  `reused-token`, `lookup-by-reference`. All 5 recorded `PASS`.

## R4 questions

### Does the transaction response include `brand` / `last_four`, and at which key path?

Yes. Both appear under the card payment method's `extra` object:

- `data.payment_method.extra.brand`
- `data.payment_method.extra.last_four`

They sit alongside other card metadata at the same level: `bin`, `name`,
`issuer`, `card_type`, `card_holder`, `is_three_ds`, `country_iso2`,
`three_ds_auth_type`, `external_identifier`, `processor_response_code`, and
(sometimes) a nested `three_ds_auth.current_step` /
`three_ds_auth.current_step_status` pair — see "Differences" below.

### Can a transaction be looked up by `reference`?

Yes. `GET /transactions?reference=<reference>` with the private key returned
`HTTP 200` with one match for the `approved` scenario's reference
(`count=1`). The response shape is `{ data: [...] }` — an **array** of
transaction objects, not a single object, even for one match. Field paths
under each array entry mirror the single-transaction shape (`data[].id`,
`data[].payment_method.extra.brand`, etc.), plus one field not seen on the
create/poll responses: `data[].payment_method.extra.unique_code`.

### Status progression and time to final status for each card

| Card | Status trail | Elapsed to final status |
| --- | --- | --- |
| Approved (4242) | `PENDING → APPROVED` | ~5.7s–8.8s across repeated runs during implementation |
| Declined (4111) | `PENDING → DECLINED` | ~5.3s–7.9s across repeated runs during implementation |

Both cards leave `PENDING` on the same 2s polling cadence; neither ever
required more than one polling cycle beyond the initial check in any run
observed. No run hit the 60s timeout.

### Error shape for an invalid token

A made-up card token on `POST /transactions` returned `HTTP 422` (not a
transaction-level `ERROR` status). Body shape:

```
error.type
error.messages.payment_method.messages.token[]
```

i.e. `{ error: { type: 'INPUT_VALIDATION_ERROR', messages: { payment_method: { messages: { token: [...] } } } } }`. No transaction is created — the
rejection happens synchronously at creation.

### Error shape for a reused token

No error occurred. Reusing a real card token from a prior successful
transaction (with a fresh `acceptance_token`/`accept_personal_auth` pair
and a new reference) returned `HTTP 201` and resolved to `APPROVED`, same
shape as a first-time use. A manual, out-of-script probe (not part of the
committed script or its acceptance criteria) pushed this further: **30
consecutive transactions with the same card token all succeeded**, with no
error at any point. This is documented as a finding, not enforced as a
pass/fail expectation — see "Differences" below for why.

By contrast, `acceptance_token` and `accept_personal_auth` **are** strictly
single-use: reusing one from a prior `GET /merchants` call fails immediately
with `HTTP 422` and `error.type: INPUT_VALIDATION_ERROR`, message text
identifying the acceptance token as already used. This was hit unintentionally
while building the script (before every scenario was changed to fetch its
own fresh pair) and is a reliable, reproducible behavior.

### Differences from the public docs

- **Card token reuse limit is undocumented and inconsistent in public
  sources.** Web search results for the gateway's own documentation gave
  contradictory claims ("don't reuse a token more than once" vs "more than
  twice"), neither with a verifiable verbatim citation. Empirical testing
  contradicts both: the same card token was reused 30 times in a row with no
  rejection. **Do not rely on any assumed reuse limit** — see Impact below.
- **Two separate expiration-like fields on the card token**, not documented
  together anywhere found: `data.expires_at` (observed several months out —
  most likely mirrors the card's own `exp_month`/`exp_year`) and
  `data.validity_ends_at` (observed about 2 days out — most likely the
  token's own usable window). This is an inference from observed values,
  not a confirmed reading of documentation text.
- **Transaction responses are heavier than the public quick-start examples
  suggest.** They embed a full nested `data.merchant.*` object (id, name,
  legal name, contact info, logo URL, keys) on every transaction, plus
  always-present but typically empty `data.entries`, `data.disbursement`,
  `data.refunds`.
- **`three_ds_auth` shape is inconsistent between calls**: sometimes a
  nested object with `current_step` / `current_step_status`, sometimes an
  empty object with no sub-keys. An adapter must treat it as optional/partial.
- **Lookup by reference always returns an array**, even for a single match,
  and includes at least one field (`payment_method.extra.unique_code`) not
  present on the create/poll transaction responses.

## Id and reference formats

- **Transaction id** (`data.id`): confirmed present via the field-name tree
  on every transaction response. Opaque string; its exact character pattern
  was intentionally never printed or recorded, per the script's rule of
  never emitting real values.
- **Card token id** (`data.id` on the `/tokens/cards` response): same as
  above — confirmed present, opaque string, no real value recorded.
- **Reference**: our own format, `TX-YYYYMMDD-XXXXXX` (6 uppercase
  alphanumerics), generated by the script and accepted as-is by the gateway
  — it is echoed back verbatim at `data.reference` and is queryable via
  `GET /transactions?reference=...`.

## Impact on api 04.1

- **Tokenize per transaction attempt.** Because the card-token reuse policy
  is not reliably documented, api 04.1's adapter should create a fresh card
  token for every charge attempt rather than caching and reusing one. If a
  "saved card" / retry-without-re-entering-card feature is needed later, it
  should go through the gateway's dedicated payment-sources mechanism
  (which is what the public docs actually document for repeat charges), not
  through raw `/tokens/cards` token reuse — and that mechanism should get
  its own verification spike before being relied on.
- **Fetch acceptance tokens immediately before each transaction.**
  `acceptance_token` / `accept_personal_auth` are confirmed single-use and
  should never be cached across transaction attempts; `GET /merchants`
  must be called fresh right before each `POST /transactions`.
- **Design the reconciler around `GET /transactions?reference=`.** It works,
  returns an array, and should be treated as "zero, one, or many matches"
  by the adapter even though a real reference should be unique in practice.
- **Map `error.type` explicitly, not just HTTP status.** A `422` from
  `POST /transactions` carries a structured `error.type` /
  `error.messages.<field>.messages.<field>[]` shape; the adapter's error
  mapping should branch on `error.type` (e.g. `INPUT_VALIDATION_ERROR`) and
  surface the nested field messages, not just the HTTP code.
- **Don't assume a minimal transaction DTO.** Responses embed a full nested
  merchant object and several typically-empty fields
  (`entries`/`disbursement`/`refunds`); the adapter's parsing should ignore
  unknown/extra fields rather than validating against a strict minimal
  schema.
- **Treat `three_ds_auth` as optional and partial.** Its shape varies
  (empty object vs. populated with `current_step`/`current_step_status`);
  defensive parsing is required.
- **Treat polling timeout as a distinct outcome**, not a failure: no run
  observed came close to the 60s timeout, but the adapter must reconcile
  (e.g. via `GET /transactions/{id}` or the reference lookup) rather than
  assume failure when a timeout does occur.
