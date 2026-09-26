# SPEC 00 — API: payment gateway sandbox spike

> **Status:** Implemented
> **Depends on:** — (standalone script; runs in parallel with infra 00)
> **Date:** 2026-09-26
> **Objective:** Run the full card-payment flow against the payment gateway sandbox with a throwaway script and record in `docs/design/gateway-findings.md` what the real API returns, so api 04.1 is built on verified behavior instead of assumptions.

## Scope

**In:**

- `scripts/gateway-spike.ts`: standalone TypeScript script, no workspace dependency (Node 22 built-ins only: `fetch`, `node:crypto`).
- Run command: `npx tsx --env-file=../gateway-spike.env scripts/gateway-spike.ts`.
- Prerequisite: `../gateway-spike.env` lives outside the repository and defines `PAYMENT_GATEWAY_URL`, `PAYMENT_GATEWAY_PUBLIC_KEY`, `PAYMENT_GATEWAY_PRIVATE_KEY`, `PAYMENT_GATEWAY_INTEGRITY_SECRET`. The user creates it before implementation starts.
- One run executes five scenarios in order:
  1. Card `4242 4242 4242 4242` → expected `APPROVED`.
  2. Card `4111 1111 1111 1111` → expected `DECLINED`.
  3. `POST /transactions` with a made-up card token → expected gateway error.
  4. `POST /transactions` reusing the token from scenario 1 → expected gateway error.
  5. Look up the scenario 1 transaction by `reference` → response recorded.
- Card scenario flow: `GET /merchants/{publicKey}` → `POST /tokens/cards` → `POST /transactions` (private key, integrity signature, both acceptance tokens) → poll `GET /transactions/{id}` every 2,000 ms until a final status or 60,000 ms.
- The script prints only statuses, elapsed times, HTTP codes and response field names. It never prints card numbers, CVC, keys, tokens, ids or references.
- The script exits `1` if any scenario misses its expected result. A polling timeout is recorded and the run continues.
- One scoped `// eslint-disable-next-line no-restricted-syntax` with a justification comment, for reading the 4 `process.env` values.
- `docs/design/gateway-findings.md` answers every R4 question with evidence from the run: field-name trees, status progression with times, id formats (no real values) and error shapes.
- The script stays in the repo after api 04.1 so the findings can be re-run.
- Claude runs the script during `/spec-impl` and writes the findings from its stdout.

**Out of scope (for future specs):**

- Production gateway adapter, ports, circuit breaker and retries (api 04.1).
- Webhook and `X-Event-Checksum` validation (api 06).
- Frontend tokenization and CSP (web 03).
- Unit tests for the script (outside the coverage scope of `apps/web` and `apps/api`).
- Adding dependencies (Zod or others) to the root `package.json` or lockfile, which infra 00 owns.
- Changes to the ESLint config (infra 00).
- Saving the run output to disk or committing ids, tokens or references.
- The third-party payouts API (a different product, not used).

## Data model

This spec persists nothing. The structures below exist only inside `scripts/gateway-spike.ts`. The only artifact is `docs/design/gateway-findings.md`.

### Constants (local to the script, no import from `@checkout/shared`)

```ts
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;
const AMOUNT_IN_CENTS = 1_500_000; // COP 15,000
const CURRENCY = 'COP';
const INSTALLMENTS = 1;
const CUSTOMER_EMAIL = 'spike@example.com';
const CARD_HOLDER = 'Spike Tester';
const FINAL_STATUSES = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;
```

### Env config (read once, validated non-empty)

```ts
type SpikeEnv = {
  gatewayUrl: string;      // PAYMENT_GATEWAY_URL
  publicKey: string;       // PAYMENT_GATEWAY_PUBLIC_KEY
  privateKey: string;      // PAYMENT_GATEWAY_PRIVATE_KEY
  integritySecret: string; // PAYMENT_GATEWAY_INTEGRITY_SECRET
};
```

### Scenarios and results

```ts
type ScenarioName = 'approved' | 'declined' | 'invalid-token' | 'reused-token' | 'lookup-by-reference';

type ScenarioResult = {
  scenario: ScenarioName;
  expected: string;          // e.g. 'APPROVED', 'HTTP 4xx'
  observed: string;          // final status or HTTP code + error.type
  passed: boolean;
  elapsedMs: number;
  statusTrail: string[];     // e.g. ['PENDING', 'APPROVED']
  fieldNames: string[];      // dotted key paths, e.g. 'data.payment_method.extra.last_four'
};
```

### Gateway request shapes (sent by the script)

```ts
// POST /tokens/cards (public key)
{ number, cvc: '123', exp_month: '12', exp_year: '<current year + 2, 2 digits>', card_holder }

// POST /transactions (private key)
{ amount_in_cents, currency, customer_email, reference, signature,
  payment_method: { type: 'CARD', token, installments },
  acceptance_token, accept_personal_auth }
```

Conventions:

- Reference: `TX-YYYYMMDD-XXXXXX` (6 random uppercase alphanumerics), a new one per transaction.
- Integrity signature: `sha256(reference + amount_in_cents + currency + integritySecret)` in hex.
- The card number and CVC are string literals in the script (public sandbox test cards). They are never printed.
- `fieldNames` holds key paths only, never values.

### `docs/design/gateway-findings.md` layout

1. Run context (date, Node version, scenarios executed; no URL, no ids).
2. One section per R4 question: answer + evidence (field-name tree, status trail, HTTP code, error shape).
3. Id and reference formats (pattern + length, no real values).
4. Differences from the public docs.
5. Impact on api 04.1 (what the adapter must do differently, if anything).

## Implementation plan

Prerequisites (not commits): the user creates `../gateway-spike.env` with the 4 variables. `/spec-impl` creates and switches to branch `spec-00-api-gateway-spike` (`AutoCreateBranch: true`).

1. **Skeleton, env and merchant call.** Create `scripts/gateway-spike.ts` with the constants, `readEnv()` (scoped eslint-disable plus comment; fails fast listing missing variable names, never values) and `getAcceptanceTokens()` → `GET /merchants/{publicKey}`. `main()` prints the HTTP code and the merchant response field names.
   Manual test: run the command and see `200` plus key paths. No token value is printed.
2. **Pure helpers.** Add `buildReference()` (`TX-YYYYMMDD-XXXXXX`), `signIntegrity()` (SHA-256 hex) and `collectFieldNames()` (recursive dotted key paths, values discarded).
   Manual test: `main()` prints one sample reference and the field names again. The signature length prints as 64.
3. **Tokenize and create transaction.** Add `tokenizeCard(number)` → `POST /tokens/cards` and `createTransaction(token, acceptance)` → `POST /transactions`. `main()` runs the approved card up to creation and prints the HTTP code, the initial status and the field names. If it exceeds ~50 lines, split tokenization and creation into two commits.
   Manual test: `201`-class response with `PENDING` (or a final status) and `data.id` reported as "present", not as a value.
4. **Polling and card scenarios.** Add `pollUntilFinal(id)` (2,000 ms / 60,000 ms, records `statusTrail` and `elapsedMs`) and `runCardScenario()` building a `ScenarioResult`. Run `approved` (4242) and `declined` (4111). Print a summary table at the end and exit `1` if any scenario failed.
   Manual test: summary shows `approved → APPROVED` and `declined → DECLINED`, exit code 0.
5. **Error scenarios.** Add `invalid-token` (made-up token) and `reused-token` (token from `approved`). Record the HTTP code, the `error.type` and the error field names.
   Manual test: both show a 4xx (or a transaction with `ERROR`, whichever the gateway returns) and `passed: true`.
6. **Lookup by reference.** Add `lookup-by-reference`: `GET /transactions?reference=<approved reference>` with the private key. Record the HTTP code, the result count and the field names. Any response counts as `passed`, since the goal is to record what happens.
   Manual test: the summary lists 5 scenarios, and `pnpm lint` passes on the file if infra 00 is already merged.
7. **Findings document.** Run the full script once. Write `docs/design/gateway-findings.md` with the layout from the Data model, based only on that run's stdout.
   Manual test: every R4 question has an answer plus evidence, and there are no real ids, tokens, references or URL.

Each step is one commit (conventional: `chore(api): …` for the script, `docs: …` for the findings) after the user reviews it.

## Acceptance criteria

- [x] `npx tsx --env-file=../gateway-spike.env scripts/gateway-spike.ts` finishes with exit code `0`.
- [x] The run summary shows `approved → APPROVED` (card 4242) and `declined → DECLINED` (card 4111).
- [x] The run summary shows a recorded result for `invalid-token`, `reused-token` and `lookup-by-reference`.
- [x] Running with a missing variable exits `1` and prints only the missing variable names.
- [x] `scripts/gateway-spike.ts` imports only Node built-ins (`node:*` or globals); no `import` from `@checkout/*` or `node_modules`.
- [x] The script contains exactly one `eslint-disable-next-line no-restricted-syntax`, with a justification comment on the line above.
- [ ] `pnpm lint` passes on `scripts/gateway-spike.ts` once infra 00 is merged into the branch. — pending: infra 00 not merged yet (no root ESLint config exists on this branch). Run before opening the PR, per the spec's own Risks table.
- [x] `docs/design/gateway-findings.md` has an answer plus evidence for each question:
  - [x] Does the transaction response include `brand` / `last_four`, and at which key path?
  - [x] Can a transaction be looked up by `reference`? (HTTP code + response shape recorded.)
  - [x] Status progression and time to final status for each card.
  - [x] Error shape for an invalid token.
  - [x] Error shape for a reused token.
  - [x] Differences from the public docs (or an explicit "none found").
- [x] `docs/design/gateway-findings.md` has an "Impact on api 04.1" section.
- [x] None of the 4 values from `../gateway-spike.env` appears in the branch diff (`git diff main... | grep -F -f <(cut -d= -f2- ../gateway-spike.env)` → no output).
- [x] The branch diff contains no gateway transaction id, card token or `TX-` reference produced by the run.
- [x] The branch diff contains no card number other than the two public test cards inside the script.
- [x] A case-insensitive search for the provider's brand name in the branch diff returns no match.
- [x] The branch diff touches only `scripts/gateway-spike.ts` and `docs/design/gateway-findings.md` (plus the spec file itself).

## Decisions

- **Yes:** run the spike even though public docs exist. The card sandbox docs only list the test cards. They say nothing about `brand`/`last_four` in the response, lookup by reference, timings or error shapes, and they warn the sandbox "may have slight differences".
- **No:** rely on the third-party payouts docs. Different product (bank disbursements), different base URL and auth; not card collection.
- **Yes:** keep the R1 `--env-file` command plus one scoped `eslint-disable-next-line no-restricted-syntax` with a comment. A standalone script has no config module to hold `process.env`.
- **No:** Zod for env validation. It does not avoid the `process.env` lint rule, and adding it would touch the root `package.json`/lockfile that infra 00 owns in parallel. Checking 4 non-empty strings by hand is enough.
- **No:** `util.parseEnv()` with the path as an argument. It avoids the disable comment but deviates from R1; the gain is cosmetic.
- **No:** asking infra 00 to exempt `scripts/**` from the rule. It would couple two parallel specs.
- **Yes:** one run executes all 5 scenarios in order. One command produces all the evidence, and `reused-token` needs the token from `approved` anyway.
- **No:** a CLI argument per scenario. Parsing for no benefit in a throwaway script.
- **Yes:** local constants (2,000 ms / 60,000 ms) that mirror `POLL_INTERVAL_MS` / `POLL_TIMEOUT_MS`. Keeps "no workspace dependency".
- **Yes:** a polling timeout is recorded, the run continues, and the script exits `1` at the end. One slow scenario does not hide the evidence of the others.
- **Yes:** fixed amount of COP 15,000 (`1_500_000` cents), `installments: 1`, `customer_email: spike@example.com`. Simple and deterministic.
- **Yes:** references in the design format `TX-YYYYMMDD-XXXXXX`, so the lookup-by-reference test uses the production shape.
- **Yes:** findings use field-name trees, status trails and id formats, with no real values. Nothing identifiable is committed (user preference).
- **No:** redacted JSON excerpts with `***`. More error-prone: a missed field leaks data.
- **No:** saving the run output to disk. stdout only, so no git-ignored file can be committed by mistake.
- **Yes:** Claude runs the script during `/spec-impl` and writes the findings from stdout. stdout carries no secrets.
- **No:** unit tests for the script. It is throwaway and outside the coverage scope of `apps/web` and `apps/api`. Lint and typecheck are enough.
- **Yes:** keep the script in the repo after api 04.1, so the findings can be re-run if the sandbox changes.
- **Yes:** branch `spec-00-api-gateway-spike`, created by `/spec-impl` with `AutoCreateBranch: true` (user choice).
- **No:** branch `feat/00-api-gateway-spike` from the phase file. The user preferred automatic branch creation, which derives the name from the spec file.

## Risks

| Risk | Mitigation |
| --- | --- |
| `npx tsx --env-file=…` does not forward the flag to Node in the installed `tsx` version. | Fallback: `node --env-file=../gateway-spike.env --import tsx scripts/gateway-spike.ts`. Record the command that worked in the findings. |
| Merchant permalinks or response values contain the provider's brand name or domain. | The script prints key paths only, never values. The findings never include the base URL or links. The brand-name grep in the acceptance criteria catches leaks. |
| The gateway accepts a reused token instead of rejecting it, and the script exits `1` even though this is a valid finding. | The unexpected result is recorded with full evidence. The findings flag it as a difference, and "Impact on api 04.1" states what the adapter must handle. The expected value is adjusted in the script only if the user agrees. |
| `GET /transactions?reference=…` does not exist or requires another auth. | Any response (404, 401, empty list) counts as evidence. api 04.1 then relies on the reconciler instead of a reference lookup. |
| The sandbox is down or slow when the script runs. | The 60 s timeout is recorded and the run continues. If the whole run fails, repeat it later. Findings are written only from a full run. |
| infra 00 merges after this branch, and CI lint then flags the script (`max-params`, filename case, type-checked rules). | Rebase on `main` after infra 00 lands and run `pnpm lint` before opening the PR. Helpers keep ≤ 3 params; the filename is already kebab-case. |
| Wrong integrity secret or key in the env file makes every POST fail with 4xx. | `main()` stops after the first card scenario if `POST /transactions` returns 401/422 for the signature. It prints the HTTP code and `error.type` so the env file can be fixed. |
| The run's stdout ends up in the Claude session transcript. | stdout carries no keys, tokens, card data, ids or references by design (R3). |

## What is **not** in this spec

- Production gateway adapter, circuit breaker and retries (api 04.1).
- Webhook checksum validation (api 06).
- Frontend tokenization and CSP (web 03).
- Unit tests for the script.
- New dependencies or ESLint config changes (infra 00).
- Third-party payouts API.

Each one of those, if it lands, goes in its own spec.
