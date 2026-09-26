# Testing conventions

Referenced from `CLAUDE.md`. Read before writing or extending tests.

## Coverage
- Jest in every workspace, with `coverageThreshold.global` at 80 for
  statements, branches, functions and lines. CI fails below it.
- Excluded from coverage only: bootstrap files (`main.ts`, `lambda.ts`,
  worker handlers, `main.tsx`), migrations, seeds, and shadcn primitives in
  `components/ui/` that were copied without changes.

## API
| Suite | Pattern | Needs | Notes |
|---|---|---|---|
| Unit | `*.spec.ts`, next to the file | Nothing | Domain and use cases with in-memory fake ports. |
| Integration | `*.int-spec.ts`, next to the repository | Migrated Postgres | Runs serially (`maxWorkers: 1`). Every raw SQL statement has one. |
| HTTP e2e | `apps/api/test/*.e2e-spec.ts` | Migrated Postgres | Supertest against the Nest app with a fake gateway adapter. |

- Integration and e2e tests never depend on the seed having run. Each test
  creates its own customers, products and transactions with
  `randomUUID()`-scoped values and never cleans up: uniqueness, not
  teardown, keeps tests independent.
- The gateway adapter is tested against recorded sandbox responses; the
  real sandbox is only hit by the Playwright smoke run.

## Web
- `*.test.tsx` next to the component or hook; Testing Library + `jsdom`.
- `renderWithProviders` (store + router) from `src/test/`.
- `src/config/env.ts` is mocked with `jest.mock` because Jest cannot parse
  `import.meta.env`.
- Test behavior the user sees (labels, roles, text), not implementation
  details or class names.

## E2E (Playwright, `apps/e2e`)
- **Mocked mode (CI):** gateway calls intercepted with `page.route`.
  Projects: Chromium, WebKit, Firefox × mobile (375×667) and desktop (1440×900).
  Scenarios: APPROVED flow, DECLINED flow, refresh mid-checkout, card
  validation, out-of-stock product.
- **Smoke mode (manual, before delivery):** against the deployed URL and the
  sandbox with test cards `4242 4242 4242 4242` (APPROVED) and
  `4111 1111 1111 1111` (DECLINED).

## Visual evidence
- Every frontend change is checked in Chrome at 375×667 and 1440×900 before
  the step summary.
- Screenshots go to `docs/evidence/<feature>/<nn>-<screen>-<viewport>.png`
  (e.g. `docs/evidence/checkout/02-card-form-mobile.png`) and are linked in the PR.
- Playwright stores its step screenshots and HTML report as CI artifacts;
  the final report is linked from the README.
