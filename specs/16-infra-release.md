# SPEC 16 — Infra: release (final deploy, manual smoke, README and evidence)

> **Status:** Approved
> **Depends on:** SPEC 09 (stacks, deploy script), SPEC 13 (async: SQS, email worker, reconciler, alarms — merged), SPEC 15 (web hardening). Optional: SPEC 14 (throttling + Postman) as a redeploy if merged before 07:15.
> **Date:** 2026-09-28
> **Objective:** The current `main` is live on AWS with its async half, verified by a manual sandbox smoke (4242 APPROVED, 4111 DECLINED) in Chrome and Safari, and a root README lets a reviewer understand, run and verify the project and find evidence for every assessment rubric item.

> Source phase: `phases/sunday/infra/09-release.md` (Parts 1 and 2 in one spec).
> Rubric source: the assessment brief (PDF, kept outside the repo — it contains shared sandbox credentials and the brand name, neither of which is ever copied here).
> Hard deadline: Monday 2026-09-28 08:00 (UTC-5). Spec written at ~05:50.

## Why this spec exists

It is the last spec before delivery. Three facts found while writing it shape the plan:

- SPEC 13 is merged but was **never deployed**: AWS runs only the API and migrator Lambdas (no email worker, reconciler, SQS or alarms). This release is the async half's first deploy — the riskiest part — so it goes first.
- `infra/scripts/deploy.sh` would fail today: SPEC 13 added the `AlarmEmail` `CfnParameter` without a default, and the script passes no `--parameters`.
- The public Swagger (`/api/docs`) works but is stale: it lists 9 paths and lacks `GET /api/v1/transactions/{id}` and `POST /api/v1/webhooks/payments`. The redeploy fixes it, and Swagger alone satisfies the rubric's "Postman Collection **or** Swagger URL public" item.

## Scope

**In:**

Part 1 — Release

- `infra/scripts/deploy.sh` passes `--parameters CheckoutBackendStack:AlarmEmail=$ALARM_EMAIL`, read from the root `.env`; a missing value fails with `Missing deploy variable: ALARM_EMAIL`. `.env.example` gains the `ALARM_EMAIL=` key (no value).
- Reserved concurrency 10 on the API Lambda (deferred here by SPEC 09; the account quota is now 1000), with a CDK assertion.
- Final `cdk deploy --all` of the current `main`, with price and explicit approval.
- Post-deploy checks: 4 Lambdas, SQS + DLQ, Scheduler, alarms, SNS subscription confirmed, `/api/v1/health`, Swagger lists every route in `main`.
- Manual smoke run **by the user** (≤ 20 min) following the checklist below, in Chrome (desktop + 375×667) and Safari (iPhone or macOS). Claude reads stock through the public API and the email worker logs (read-only) before and after.
- Mozilla Observatory grade (target A) and a Lighthouse mobile run on a product page (target LCP < 2.5 s), both saved as evidence.
- Conditional: if SPEC 14 merges before 07:15, a code-only redeploy plus a quick throttling check.
- `infra/README.md` gets a short "Release (2026-09-28)" evidence block.

Part 2 — README

- Root `README.md`, following the structure of the author's previous assessment README (Canals): badges, one-paragraph overview, live-links callout, TOC, Features, Quickstart, Tech stack, Architecture (Mermaid + components table), Project structure, API, Seed data and test cards, Configuration, Development and testing (coverage tables), Deploy and destroy, CI, Design decisions, Further reading, Known limitations, **Rubric map**.
- Brand-name check across the whole repository, the git history and the branch names.

**Out of scope (for future specs):**

- Playwright (web 08): not specced, `apps/e2e` is empty. The README declares it pending; the smoke is manual.
- Postman collection: owned by SPEC 14. The README links `docs/postman/` only if SPEC 14 has merged; otherwise it says "pending (SPEC 14)".
- WAF, custom domain, CI deployment via OIDC.
- Any application code change. A bug found in the smoke gets its own small `fix:` PR, not a commit here.
- A dbdiagram.io image export of the data model (Mermaid `erDiagram` + DBML link instead).
- Firefox in the manual smoke (the rubric asks for "different browsers"; Chrome + Safari cover it).

## Data model

This spec adds no tables, columns or migrations.

### Configuration changes

```ts
// infra/lib/config/constants.ts
export const API_LAMBDA = {
  memoryMb: 1024,
  timeoutSeconds: 29,
  runtime: 'nodejs22.x',
  arch: 'arm64',
  reservedConcurrency: 10, // 10 containers × TypeORM pool 2 = ≤ 20 RDS connections
};
```

```bash
# .env.example (key only; the real address lives in the git-ignored .env)
ALARM_EMAIL=

# infra/scripts/deploy.sh (last line)
pnpm --filter @checkout/infra exec cdk deploy --all --profile soundhub \
  --parameters "CheckoutBackendStack:AlarmEmail=${ALARM_EMAIL}"
```

### Evidence files

```
docs/evidence/release/
  01-product-chrome-1440x900.png        stock before
  02-summary-chrome-1440x900.png        4242, qty 2
  03-approved-chrome-1440x900.png
  04-product-after-chrome-1440x900.png  stock −2
  05-summary-refresh-chrome-375x667.png refresh restores the summary
  06-declined-chrome-375x667.png        4111
  07-approved-safari.png                iPhone or macOS Safari
  08-emails-inbox.png                   3 result emails (addresses cropped)
  09-observatory.png
  10-swagger.png
  lighthouse-mobile.html                full report
  11-lighthouse-mobile.png
```

### README outline

```
# SoundHub — headphones checkout
badges (CI · Node 22 · NestJS · React · PostgreSQL 16 · AWS CDK)
overview paragraph
> Live: app (CloudFront) · Swagger /api/docs · health · Postman (if SPEC 14)
TOC
Features · Quickstart · Tech stack · Architecture · Data model · Project structure
API · Seed data and test cards · Configuration · Development and testing
Deploy and destroy · CI and contributing · Design decisions · Rubric map
Further reading · Known limitations
```

## Manual smoke checklist (the user runs it, ≤ 20 min)

App: `https://d2dponv42xzzpw.cloudfront.net`. Use your **real inbox** as the customer email so the result emails can be checked. Test data never contains real card data.

Before starting, Claude records `stockAvailable` of the chosen product with `curl …/api/v1/products/<id>`.

| # | Browser / viewport | Steps | Expected | Screenshot |
|---|---|---|---|---|
| A | Chrome 1440×900 | Open a product with stock ≥ 3 → qty 2 → "Pay with credit card" → card `4242 4242 4242 4242`, holder `APPROVED TEST`, expiry `12/29`, CVC `123`, 1 installment → name, cédula `1234567890`, your email, phone `3001234567`, Antioquia / Medellín, any address → accept both checkboxes → continue | Summary with subtotal, base fee, delivery fee (Medellín metro → 0 if subtotal ≥ 200,000, else 20,000), total, `•••• 4242` | 01, 02 |
| A | same | Pay | APPROVED status screen | 03 |
| A | same | Back to the product | Stock shown = before − 2 | 04 |
| B | Chrome DevTools, iPhone SE 375×667 | Same product, qty 1, card `4111 1111 1111 1111`, reach the summary → **refresh (F5)** | Summary restored after refresh | 05 |
| B | same | Pay | DECLINED status; product stock unchanged | 06 |
| C | Safari (iPhone, or macOS Safari) | Another product, qty 1, card 4242 | APPROVED | 07 |
| D | Your inbox | Wait up to 2 min | 3 result emails (2 approved, 1 declined) | 08 |

After the run, Claude re-reads the stock via the API and tails the email worker's CloudWatch logs (read-only) to confirm three sends. If any row fails, it is recorded as a finding, not fixed here.

## Implementation plan

Prerequisites (not commits):

- [x] GitHub repository renamed to `alesmo30/soundhub-checkout` and the local `origin` updated (done by the user before this spec was saved).
- `/spec-impl` creates and switches to `spec-16-infra-release` (`AutoCreateBranch: true`).
- The user adds `ALARM_EMAIL=<address>` to the root `.env`.
- The `soundhub` AWS profile is valid.

**AWS rule:** before any command that creates, modifies or destroys AWS resources, Claude states the price and waits for explicit approval. Read-only commands (`describe-*`, `logs tail`, `curl`) run freely. Push and PR only when the user asks.

**Time plan:** steps 1–3 by ~06:35; README drafting (steps 6–8) starts while `cdk deploy` runs and commits after step 4; step 4 at ~06:40–07:00; step 5 only if SPEC 14 lands before 07:15; close-out by 07:50.

### Part 1 — Release

1. [x] **AlarmEmail in the deploy script.** `deploy.sh` reads `ALARM_EMAIL` from the root `.env`, fails fast naming it when missing or empty, and passes `--parameters CheckoutBackendStack:AlarmEmail=…`. `.env.example` gets the `ALARM_EMAIL=` key.
   Manual test: with `ALARM_EMAIL` removed, `bash infra/scripts/deploy.sh` exits before building with `Missing deploy variable: ALARM_EMAIL`; with it set, `cdk synth` succeeds.
   Commit: `fix(infra): pass AlarmEmail parameter from .env to cdk deploy`.

2. [ ] **Reserved concurrency 10.** `API_LAMBDA.reservedConcurrency = 10` in `constants.ts`, `reservedConcurrentExecutions` on the API Lambda. `backend-stack.test.ts` replaces the "no `ReservedConcurrentExecutions`" assertion with `ReservedConcurrentExecutions: 10` on the API Lambda only (the workers stay unreserved).
   Manual test: `pnpm --filter @checkout/infra test` green.
   Commit: `feat(infra): reserve concurrency 10 on the API Lambda`.

3. [ ] **Final deploy.** State the price, get approval, run `pnpm --filter @checkout/infra run deploy` and confirm each CDK security prompt. **Cost:** ~USD 23–25/month (unchanged); the new pieces — SQS, Scheduler (43,200 runs/month, within the 14 M free tier), 2 worker Lambdas, SNS, 3 CloudWatch alarms (~USD 0.30/month) — add under USD 1/month. The user confirms the SNS subscription email. Then read-only checks:
   - `aws lambda list-functions` shows API, migrator, email worker, reconciler; the API Lambda has reserved concurrency 10;
   - the `transaction-finalized` queue and its DLQ exist; the schedule is `ENABLED`;
   - `/api/v1/health` → `{ status: 'ok', database: 'up' }`;
   - `/api/docs-json` lists every route in `main`, including `/api/v1/transactions/{id}` and `/api/v1/webhooks/payments`.

   Save `10-swagger.png`. Add a "Release (2026-09-28)" block to `infra/README.md` (date, commit deployed, outputs unchanged or updated).
   Commit: `docs(infra): record release deploy`.

4. [ ] **Manual smoke, Observatory and Lighthouse.** The user runs the smoke checklist above and drops the screenshots into `docs/evidence/release/`. Claude records the stock before/after and the email worker log lines. Claude runs Mozilla Observatory on the CloudFront host (screenshot `09`), and `npx lighthouse <cloudfront>/products/<id> --form-factor=mobile --screenEmulation.mobile --output html --output-path docs/evidence/release/lighthouse-mobile.html --chrome-flags="--headless"` (screenshot `11`, no new dependency). Numbers go into the README later.
   Manual test: every file listed in the Data model exists; no screenshot shows a full email address or any secret.
   Commit: `docs: add release smoke, Observatory and Lighthouse evidence`.

5. [ ] **Conditional: SPEC 14 redeploy.** Only if SPEC 14 merged before 07:15. Pull `main`, state the price (unchanged), approve, redeploy. Checks: `/api/v1/health` 200; 21 rapid `POST /api/v1/customers` with an empty body return 400 ×20 then 429 with `Retry-After`; `/api/docs` shows the 429 responses. Update the release block in `infra/README.md`. If SPEC 14 did not land, the step is ticked with the note "skipped — SPEC 14 not merged" and no commit is made.
   Commit: `docs(infra): record SPEC 14 redeploy`.

### Part 2 — README

6. [ ] **Overview and quickstart.** Title, badges (CI badge for `alesmo30/soundhub-checkout`), overview paragraph, live-links callout (app, Swagger, health, Postman or "pending (SPEC 14)"), TOC, Features, Quickstart (prerequisites: Node 22, pnpm 10, Docker; `pnpm install`, `cp .env.example .env`, `docker compose up -d postgres`, `migration:run`, `seed`, `pnpm dev`, a first `curl` to `/api/v1/products`), Tech stack, Seed data and test cards (4242 → APPROVED, 4111 → DECLINED; card data is fake and never reaches the backend).
   Manual test: every command in Quickstart matches a script in a `package.json`; the preview renders on GitHub (or a local Markdown preview).
   Commit: `docs: add root README overview and quickstart`.

7. [ ] **Architecture, data model, structure and API.** Mermaid AWS diagram derived from `docs/design/04-aws-architecture.md` (CloudFront → S3 / HTTP API → 4 Lambdas → RDS, SQS, Scheduler, NAT instance) with a components table ("responsibility / never does"); the payment flow in 6 numbered lines (quote → customer → PENDING transaction → gateway → finalize: status, delivery, stock → email); Mermaid `erDiagram` of the tables in `data-model.dbml` plus links to the DBML and `01-data-model.md`; folder tree of `apps/api` (hexagonal) and `apps/web` (features); endpoint table from `/api/docs-json` with a status-code table per mutating endpoint and a link to `02-api-contracts.md`.
   Manual test: both Mermaid blocks render; every route in the table exists in the deployed Swagger.
   Commit: `docs: add architecture, data model and API sections to README`.

8. [ ] **Testing, deploy, decisions and limitations.** Run `pnpm --filter @checkout/api test:cov`, `pnpm --filter @checkout/web test:cov` and `pnpm --filter @checkout/api test:int`; paste two coverage tables (statements, branches, functions, lines) and the integration test count. E2E: API HTTP e2e (SPEC 14, if merged), Playwright pending (web 08), manual smoke with links to `docs/evidence/release/`. Visual evidence links (`docs/evidence/*`). Configuration table (variable names and purpose only, never values). Deploy and destroy: short summary + link to `infra/README.md`, with the monthly cost. Observatory grade and Lighthouse numbers. CI jobs table. Design decisions and trade-offs (hexagonal + ROP, integer cents, server-side amounts, tokenization in the browser, stock reservation + reconciler, idempotency layers, NAT instance vs NAT Gateway, webpack vs esbuild, two CloudFront header policies). Known limitations (Playwright pending, single NAT instance, no WAF, no custom domain, anything else the smoke found).
   Manual test: every number in the README comes from a command run in this step or from step 3–4 evidence.
   Commit: `docs: add testing, deploy and design decisions to README`.

9. [ ] **Rubric map.** A table with every rubric item and bonus from the assessment brief (reworded without the brand), its points, where it is implemented and a link to its evidence; plus rows for the brief's README-specific asks (Swagger/Postman URL, data model, coverage results):

   | Rubric item | Pts | Where | Evidence |
   |---|---|---|---|
   | README complete | 5 | this file | — |
   | Fast images, no UI out-of-bounds | 5 | WebP + `srcset`, SPEC 15 | Lighthouse, `docs/evidence/final/` |
   | Full card checkout | 20 | `apps/web/src/features/*` | smoke screenshots 01–08 |
   | API working | 20 | `apps/api` | Swagger, integration/e2e counts |
   | Coverage > 80 % back and front | 30 | Jest | coverage tables |
   | App and API deployed | 20 | `infra/` | live links, `/health` |
   | Bonus: OWASP, HTTPS, headers | 5 | CloudFront policies + helmet | Observatory |
   | Bonus: responsive, browsers | 5 | Tailwind mobile-first | Chrome + Safari screenshots |
   | Bonus: CSS | 10 | `apps/web/DESIGN.md` | design-system evidence |
   | Bonus: clean code | 10 | `references/coding-conventions.md`, lint | CI |
   | Bonus: hexagonal | 10 | `apps/api/src/modules/*/{domain,application,infrastructure}` | lint boundaries (`references/layering.md`) |
   | Bonus: ROP | 10 | use cases returning `Result` | a linked use case |

   Manual test: every link in the table resolves in the repository.
   Commit: `docs: add rubric map to README`.

### Close-out

10. [ ] **Checks and status.**
    - Brand check: `git grep -i` for the brand name and for the sandbox host (typed in the terminal, never written in a file) returns nothing; the same over `git log --all --format=%B` and `git branch -a`.
    - `grep -n TBD README.md` returns nothing.
    - Every README link resolves (`npx markdown-link-check README.md`, no new dependency).
    - Fresh clone into the scratchpad, follow Quickstart up to `pnpm dev` and `GET /api/v1/health` → 200 (reusing the fixed-name compose project's Postgres).
    - Mark this spec `Implemented`.
    - Push and PR only when the user asks; the user decides merge timing against the 08:00 deadline.

    Manual test: all checks above green.
    Commit: `docs: mark spec 16 as Implemented`.

Notes:

- The stacks stay deployed after delivery (~USD 23–25/month). `cdk destroy` runs only when the user decides, with confirmation.
- If the smoke finds a bug, it is recorded in Known limitations and fixed in a separate `fix:` PR only if time allows.

## Acceptance criteria

Deploy

- [ ] `deploy.sh` fails naming `ALARM_EMAIL` when it is missing, and passes it as `AlarmEmail` when present.
- [ ] `pnpm --filter @checkout/infra test` is green, including `ReservedConcurrentExecutions: 10` on the API Lambda only.
- [ ] `cdk deploy --all` of the current `main` succeeds; AWS shows 4 Lambdas, the `transaction-finalized` queue and DLQ, an enabled 1-minute schedule and 3 alarms; the SNS subscription is confirmed.
- [ ] `https://d2dponv42xzzpw.cloudfront.net/api/v1/health` returns 200 with `database: 'up'`.
- [ ] `/api/docs` renders and `/api/docs-json` lists every route in `main`, including `/api/v1/transactions/{id}` and `/api/v1/webhooks/payments`.

Smoke

- [ ] 4242 in Chrome reaches APPROVED and the product's stock drops by the quantity bought.
- [ ] 4111 in Chrome at 375×667 reaches DECLINED and the stock does not change.
- [ ] Refreshing on the summary restores it.
- [ ] 4242 in Safari reaches APPROVED.
- [ ] One result email arrives per finalized transaction, and the email worker logs show the sends.

Evidence

- [ ] Every file listed under "Evidence files" exists in `docs/evidence/release/`, with no full email address or secret visible.
- [ ] Mozilla Observatory grade recorded (target A; findings listed if lower).
- [ ] Lighthouse mobile LCP recorded (target < 2.5 s; the real value is recorded either way).

README

- [ ] Contains every section of the outline, with live links to the app and Swagger in the first screen.
- [ ] Coverage tables for api and web show all four metrics, each ≥ 80 %, taken from a run in step 8.
- [ ] The rubric map covers all 6 items and 6 bonuses, and every link in it resolves.
- [ ] Postman is linked if SPEC 14 merged, or marked "pending (SPEC 14)" otherwise.
- [ ] A fresh clone following Quickstart reaches `GET /api/v1/health` → 200 locally.
- [ ] No `TBD` left, and every link resolves.

Hygiene

- [ ] The brand name and the sandbox host appear nowhere in the repository, commit messages or branch names.
- [ ] No secret, credential or real email address is committed (README configuration lists names only).
- [ ] The repository is public at `github.com/alesmo30/soundhub-checkout`.

## Decisions

Sections after the header were written in one pass at the user's request (deadline 08:00).

Spec shape

- **Yes:** one spec for both parts of the phase, as SPEC 09 did ("one file = one spec").
- **Yes:** number 16 — 13 and 14 were taken by in-progress worktrees and 15 is merged.

Smoke (question 1)

- **Yes:** manual smoke run by the user following a step-by-step checklist, in Chrome and Safari, with screenshots as evidence; Playwright declared pending in the README. It fits the 20-minute window and still meets the phase's "Chrome and Safari" criterion.
- **No:** a mini Playwright smoke inside this spec — 45–60 extra minutes, it invades web 08's `apps/e2e`, and a broken selector would eat the README time (5 rubric points).
- **No:** waiting for web 08 — not specced, it does not fit before 08:00.
- **Deviation from the phase:** R2 says "Playwright smoke mode"; the smoke is manual instead, for the reasons above.

Order and timing (question 2)

- **Yes:** deploy now with the current `main` (SPEC 13 merged) and write the README while `cdk deploy` runs; SPEC 14 enters as a code-only redeploy if it merges before 07:15. The async half's first deploy surfaces failures at ~06:15, not at 07:30.
- **No:** waiting for SPEC 14 before a single deploy — it concentrates all the risk in the last 40 minutes.
- **No:** deploy before SPEC 13 merged and redeploy later — the smoke would run twice (~25 min lost). Moot once SPEC 13 merged.
- **Deviation from the phase:** it orders Part 1 before Part 2; here README drafting overlaps the deploy wait, but commits stay in plan order.

Swagger vs Postman

- **Yes:** the public Swagger (`/api/docs`) is the guaranteed deliverable for the rubric's "Postman Collection or Swagger URL public" item; the redeploy refreshes its stale routes. Postman is linked only if SPEC 14 lands.

Rubric map (question 3)

- **Yes:** built from the assessment brief PDF the user provided: 6 items, 6 bonuses, and the brief's README-specific asks (Swagger/Postman URL, data model, coverage results). Items are reworded without the brand.
- **No:** a map keyed by our own FR/NFR IDs — the reviewer would have to translate between their rubric and our IDs.
- **Yes:** nothing from the PDF's credentials section is ever copied into the repo or the spec.

Repository name (question 4)

- **Yes:** rename the GitHub repository to `soundhub-checkout` before delivery. The brief forbids the company name anywhere in the repository, and the repository itself was named after it. GitHub keeps PRs and history and redirects the old URL. Done by the user; `origin` updated.
- **No:** leaving the name — an explicit, avoidable rubric risk.
- **No:** `headphones-checkout` — also valid; the user chose `soundhub-checkout` to match the product name.

Reserved concurrency (question 5)

- **Yes:** reserved concurrency 10 on the API Lambda in this deploy, as SPEC 09 deferred it here and `04-aws-architecture.md` §2 specifies it. It caps RDS at ≤ 20 connections (10 × pool 2); the account quota is now 1000, so the reservation no longer fails the deploy. ~10 minutes, before the deploy.
- **No:** leaving it as a Known limitation — the README's architecture would describe something AWS does not enforce.

Details decided without a question

- **Yes:** `deploy.sh` passes `AlarmEmail` from the root `.env` (`ALARM_EMAIL`), failing fast when missing. It is deployment configuration in `infra/**`, which the phase assigns to this spec.
- **Yes:** Mermaid for the architecture diagram and a Mermaid `erDiagram` plus DBML link for the data model, instead of an exported image — GitHub renders it and it costs no tooling time.
- **Yes:** Lighthouse via `npx lighthouse` (no new dependency), mobile form factor, HTML report committed as evidence.
- **Yes:** README structure modeled on the author's Canals README (sections, callout of live links, components table, status-code tables, known limitations), extended with coverage, deploy, evidence and the rubric map.

## Risks

| Risk | Mitigation |
| --- | --- |
| The async half's first deploy fails (bundle entry, IAM, SQS event source, Scheduler role). | It runs first (~06:00), leaving ~2 h to fix. SPEC 13's CDK assertions already cover the templates. A fix is deployment configuration in `infra/**`; an app bug goes to its own PR. |
| The migrator trigger fails and rolls back the backend stack (new migrations from SPECs 10–12b). | Its CloudWatch logs are read immediately; migrations are idempotent, so a redeploy retries. |
| Emails do not arrive (SMTP secrets, NAT, worker errors). | Worker logs are tailed after the smoke; the DLQ alarm fires to `ALARM_EMAIL`. If unresolved by 07:30, it goes in Known limitations with the evidence. |
| Reserved concurrency 10 throttles the smoke. | Demo traffic is far below 10 concurrent; the smoke is sequential. |
| The shared sandbox account is used by other candidates, so gateway calls are slow or the sandbox misbehaves. | The smoke only needs 3 transactions; a PENDING that resolves late is settled by the reconciler within ~1 min. |
| Lighthouse LCP exceeds 2.5 s (cold Lambda on the first API call). | Run twice and record the warm run with the cold value noted; the real numbers are recorded either way. |
| The brand or the sandbox host leaks into the README (e.g. a pasted URL, a screenshot of the gateway widget, a CSP header). | Step 10 greps the repo, history and branches; screenshots are reviewed before commit; the Configuration table lists names only. |
| A screenshot exposes the user's real email address. | Crop or blur before committing; acceptance criterion checks it. |
| Time runs out before 08:00. | Order protects value: deploy → smoke → README core (6–8) → rubric map (9) → checks (10). Step 5 is the first thing dropped. |
| `docker compose` in the fresh-clone check collides with the running Postgres. | The compose project has a fixed name, so the clone reuses the same container. |

## What is **not** in this spec

- Playwright (web 08) — README marks it pending.
- The Postman collection (SPEC 14).
- WAF, custom domain, CI deployment via OIDC.
- Any application code change; smoke findings become their own `fix:` PR or a Known limitation.
- A dbdiagram.io image of the data model.
- `cdk destroy` (only when the user decides, after the evaluation).

Each of these, if it lands, goes in its own spec.
