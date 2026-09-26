# CLAUDE.md

Project conventions for Claude Code (and any implementer) working in this
repo. This file loads automatically every session and is kept short on
purpose. Read alongside:

- `requirements/general-requirements.md` — functional and non-functional requirements.
- `docs/design/01-data-model.md` (+ `data-model.dbml`), `02-api-contracts.md`,
  `03-folder-structure.md` — the approved design.
- `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md` load automatically when
  working inside each app.

## The product in one paragraph

SoundHub is a single-product checkout for headphones paid by credit card
through a payment gateway's sandbox. Five screens: product page → card and
delivery info → summary → final status → back to the product page with the
updated stock. Monorepo: NestJS API (hexagonal + Railway Oriented
Programming), React SPA (Vite + Redux Toolkit), deployed on AWS with CDK.

## Non-negotiables

- The payment provider's brand name never appears in code, docs, env vars,
  branch names or commits. Call it "the payment gateway".
- The card number and CVC never reach the backend, Redux, browser storage
  or any log. Only `{ token, brand, last4 }` survives tokenization.
- Money is always integer cents. Amounts are computed only on the server.
- Coverage ≥ 80% (statements, branches, functions, lines) in both `apps/web`
  and `apps/api`.
- Sandbox only. Secrets live in `.env` locally (git-ignored) and in AWS
  Secrets Manager when deployed.

## References

Topic-specific conventions live under `references/` and are **not** loaded
automatically. Read the relevant one before working on that topic:

- `references/coding-conventions.md` — shared web + api rules: max 3
  positional parameters, named constants over env vars, use cases vs
  helpers, comments, naming, errors as `Result`, raw SQL scope.
- `references/layering.md` — API hexagonal boundaries, web feature
  boundaries, and the lint rules that enforce them.
- `references/data-integrity.md` — money, stock reservation, idempotency,
  finalization, soft deletes, sensitive data.
- `references/testing.md` — Jest suites, integration fixtures, Playwright
  modes and visual evidence.

## Commands

```bash
pnpm install
docker compose up -d postgres                 # local Postgres 16
pnpm --filter @checkout/api migration:run     # apply migrations
pnpm --filter @checkout/api seed              # municipalities, warehouses, products (local only)
pnpm dev                                      # api + web in watch mode
pnpm lint                                     # eslint + prettier check, all workspaces
pnpm typecheck
pnpm test                                     # unit tests, all workspaces
pnpm test:cov                                 # unit tests with coverage thresholds
pnpm --filter @checkout/api test:int          # integration tests, needs Postgres
pnpm --filter @checkout/e2e test              # Playwright, mocked gateway
pnpm verify                                   # lint + typecheck + test:cov + test:int + e2e
```

## Per-step workflow

After implementing each step of the plan:

1. Frontend steps only: validate the change in Chrome at 375×667 (iPhone SE)
   and 1440×900, and save the screenshots to `docs/evidence/<feature>/`.
2. Write a clear summary of what changed, with a simple example of what the
   code does (not just which files changed).
3. Stop and let the user review the diff.
4. Wait for explicit confirmation.
5. Only then commit that step: one commit per plan step, never one commit
   for a whole feature.

Do not batch steps or skip the summary-then-wait sequence, even when the
change looks trivial.

## Git

- Conventional commits (`feat(api): …`, `fix(web): …`, `test(api): …`, `docs: …`, `chore: …`).
- One branch and one PR per feature: `feat/<scope>-<short-name>`.
- Never commit `.env`, keys or generated coverage output.
