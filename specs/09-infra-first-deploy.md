# SPEC 09 — Infra: first deploy (data, backend and frontend stacks)

> **Status:** Approved
> **Depends on:** SPEC 01 (workspace, CI, `.env` conventions), SPEC 02 (API bootstrap, `configureApp`, data source, migrations and `runSeed`), SPEC 03 (web build)
> **Date:** 2026-09-27
> **Objective:** A public HTTPS CloudFront URL serves the SPA and proxies `/api/*` to the real NestJS app running in a Lambda inside a private VPC against a non-public RDS PostgreSQL, all created and destroyed through CDK.

> Source phase file: `phases/saturday/infra/05-first-deploy.md` (Parts 1 and 2 in one spec).
> Runs in parallel with SPEC 08 (api 04.1). This spec owns the Lambda dependencies in `apps/api/package.json`; SPEC 08 adds none.

## Scope

**In:**

Part 1 — Data stack (`infra/`)

- CDK app in TypeScript: `infra/{package.json, tsconfig.json, cdk.json, bin/app.ts}`.
  - Region `us-east-1`; account from the `soundhub` AWS profile.
  - Stack names prefixed `Checkout`; tag `project=headphones-checkout` on everything.
- `infra/lib/config/deploy-env.ts` loads the root `.env` at synth time.
  - It reads the non-secret values: gateway URL and public key, `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`.
  - A missing variable fails `cdk synth` with the variable's name.
  - Nothing brand-related is committed.
- `CheckoutDataStack`:
  - VPC with 2 AZs and public, private-with-egress and isolated subnets.
  - NAT **instance** t4g.nano via `NatProvider.instanceV2`. No NAT Gateway.
  - RDS PostgreSQL 16 db.t4g.micro, gp3 20 GB, single-AZ, in the isolated subnets. Not publicly accessible. Parameter group with `rds.force_ssl=1`. 1-day backups. Credentials generated into Secrets Manager (`db-credentials`).
  - `LambdaSecurityGroup` (exported). It is the only source allowed to reach 5432.
  - `app-secrets` created with the expected keys and placeholder values: `PAYMENT_GATEWAY_PRIVATE_KEY`, `PAYMENT_GATEWAY_INTEGRITY_SECRET`, `PAYMENT_GATEWAY_EVENTS_SECRET`, `SMTP_USER`, `SMTP_PASSWORD`. Real values are set by hand with the AWS CLI and never committed.
  - Every resource uses `RemovalPolicy.DESTROY`: RDS without a final snapshot and without deletion protection; secrets deleted without a recovery window.

Part 2 — Backend and frontend stacks

- `apps/api/src/lambda.ts`, run once per container:
  1. read `db-credentials` and `app-secrets` with `@aws-sdk/client-secrets-manager`;
  2. copy them into `process.env` under the `.env` names;
  3. create the Nest app through `configureApp()` and `@codegenie/serverless-express`.

  The app and its `DataSource` are reused across invocations.
- `apps/api/src/workers/migrator.handler.ts`:
  - builds its own `DataSource` with the migration classes imported explicitly (no glob), then runs the migrations and `runSeed()`;
  - is idempotent, and a failure fails the deploy.
- `DB_SSL` support in `buildDataSourceOptions`:
  - when `DB_SSL=true`, it uses `ssl: { ca: <RDS global bundle>, rejectUnauthorized: true }`;
  - it stays off locally;
  - `rds-global-bundle.pem` (public AWS CA bundle) ships with the Lambda bundle.
- Lambda bundle through the existing Nest CLI webpack builder, with a `webpack.lambda.config.cjs`:
  - entries `lambda.ts` and `migrator.handler.ts`;
  - `node_modules` bundled except unused optional modules;
  - decorator metadata and the Swagger plugin preserved;
  - Swagger UI assets available at runtime.

  Bundle size and cold start time are recorded in the PR.
- `CheckoutBackendStack`:
  - API Lambda: Node 22, arm64, 1024 MB, in the private subnets with `LambdaSecurityGroup`, logs kept 14 days, **no reserved concurrency**.
  - HTTP API with Lambda proxy integration and default throttling of 50 rps, burst 100.
  - Migrator Lambda run by `triggers.Trigger` after every deploy.
  - Least-privilege `grant*` for the secrets.
- `CheckoutFrontendStack`:
  - Private S3 bucket with OAC (auto-delete on destroy).
  - CloudFront behaviors:
    - `/*` and `/images/*` → S3, with `/images/*` cached 1 year, immutable;
    - `/api/*` → HTTP API, with no cache, forwarding the query and headers except `Host`.
  - The viewer-request SPA rewrite function attached to the S3 behaviors only.
  - Two Response Headers Policies:
    - **S3:** the full §5 policy with override;
    - **`/api/*`:** HSTS, `Referrer-Policy` and `Permissions-Policy`, without override and without CSP, so helmet keeps deciding (Swagger).
  - `BucketDeployment` of `apps/web/dist`, which includes the product images, with cache invalidation.
- Build-and-deploy scripts: the web is built with `VITE_API_MOCKING=false` and the `VITE_*` values from `.env`, then the Lambda bundle, then `cdk deploy --all`.
- Stack outputs: CloudFront URL and API URL, recorded in `infra/README.md`. The CloudFront URL is the Postman `{{baseUrl}}` for the AWS environment.

Tests and docs

- `infra/test/**` with `aws-cdk-lib/assertions` on synthesized templates. Fixed fake account and region; no context lookups; asset paths injected as props, so the tests need no build and no AWS. The tests check:
  - RDS is not public and forces SSL;
  - there is no NAT Gateway;
  - only the Lambda security group reaches 5432;
  - the headers policies;
  - the SPA function sits on the S3 behaviors only.
- A new `infra` job in `.github/workflows/ci.yml` runs `pnpm --filter @checkout/infra test`.
- `infra/README.md` gives the exact commands for:
  - the `soundhub` profile;
  - bootstrap;
  - the budget alert (USD 30/month);
  - setting secrets;
  - deploy, outputs and destroy;
  - deactivating the deployer key after the evaluation;
  - checking the Lambda concurrency quota request.

Operations (with explicit approval and price before each one)

- `cdk bootstrap` (~USD 0.01/month).
- An AWS Budgets alert at USD 30/month (free).
- `cdk deploy --all` (~USD 23/month while it exists).
- A final `cdk destroy`, when the user decides.

**Out of scope (for future specs):**

- SQS + DLQ, EventBridge Scheduler, email worker, reconciler Lambda, CloudWatch alarms (infra 06).
- Reserved concurrency 10 on the API Lambda. It is blocked by the account limit of 10; it lands in infra 09 once the quota increase (request `5748b3c72b314c8fb36167d73d5adc52YXKB9cGl`) is approved.
- The stricter throttle on `POST /api/v1/transactions`, and WAF (api 07 / stretch).
- The Postman collection itself (api 07) and the root README (infra 09).
- CI deployment through GitHub OIDC (stretch).
- A custom domain. The default `*.cloudfront.net` gives free HTTPS.
- Any change to `apps/api/src/modules/**` or `apps/web/src/**`.

## Data model

This spec adds no tables, columns or migrations. It introduces infrastructure configuration, one optional API environment variable (`DB_SSL`) and the Lambda entry points.

### New and changed files

```
infra/
├─ package.json · tsconfig.json · cdk.json · jest.config.ts · README.md
├─ bin/app.ts                          instantiates the 3 stacks with env { account, region: 'us-east-1' }
├─ lib/
│  ├─ config/
│  │  constants.ts                     names, sizes, TTLs (below)
│  │  deploy-env.ts                    loadDeployEnv(): reads the root .env via node:util parseEnv
│  ├─ data-stack.ts                    CheckoutDataStack
│  ├─ backend-stack.ts                 CheckoutBackendStack
│  ├─ frontend-stack.ts                CheckoutFrontendStack
│  └─ functions/spa-rewrite.js         CloudFront Function source (viewer-request)
└─ test/
   data-stack.test.ts · backend-stack.test.ts · frontend-stack.test.ts
   deploy-env.test.ts · spa-rewrite.test.ts · fixtures/{lambda-bundle,web-dist}/  (placeholder files)

apps/api/
├─ package.json                        + deps (below) · + build:lambda script
├─ webpack.lambda.config.cjs           entries lambda + migrator · bundles node_modules · node.__dirname = false
├─ scripts/copy-lambda-assets.ts       copies rds-global-bundle.pem and swagger-ui-dist assets into dist-lambda/
├─ certs/rds-global-bundle.pem         public AWS RDS CA bundle
└─ src/
   ├─ lambda.ts                        API handler (coverage-excluded bootstrap)
   ├─ workers/migrator.handler.ts      migrations + runSeed (coverage-excluded bootstrap)
   ├─ shared/infrastructure/aws/
   │  load-secrets.ts (+ .spec.ts)     fetch both secrets once, map them to env names
   ├─ config/environment-variables.ts  + DB_SSL (optional, 'true' | 'false', default 'false')
   ├─ config/app-config.ts             + db.ssl: boolean
   └─ shared/infrastructure/persistence/data-source.ts
                                       + ssl { ca, rejectUnauthorized: true } when db.ssl

.github/workflows/ci.yml               + job `infra`: pnpm --filter @checkout/infra test
```

### Dependencies

| Workspace | Runtime | Dev |
|---|---|---|
| `infra` | `aws-cdk-lib`, `constructs` | `aws-cdk`, `typescript`, `tsx`, `jest`, `@swc/jest`, `@types/jest`, `@types/node` |
| `apps/api` | `@codegenie/serverless-express`, `@aws-sdk/client-secrets-manager` | `@types/aws-lambda` |

No `dotenv` in `infra`: `node:util` `parseEnv` reads the `.env`. The lockfile protocol applies if SPEC 08 merges first.

### Constants

```ts
// infra/lib/config/constants.ts
export const REGION = 'us-east-1';
export const STACK_PREFIX = 'Checkout';
export const PROJECT_TAG = { key: 'project', value: 'headphones-checkout' };
export const DB_NAME = 'checkout';
export const DB_INSTANCE = 'db.t4g.micro';
export const DB_STORAGE_GB = 20;
export const DB_BACKUP_DAYS = 1;
export const NAT_INSTANCE = 't4g.nano';
export const API_LAMBDA = { memoryMb: 1024, timeoutSeconds: 29, runtime: 'nodejs22.x', arch: 'arm64' };
export const MIGRATOR_LAMBDA = { memoryMb: 512, timeoutSeconds: 300 };
export const LOG_RETENTION_DAYS = 14;
export const HTTP_API_THROTTLE = { rateLimit: 50, burstLimit: 100 };
export const IMAGES_MAX_AGE_SECONDS = 31_536_000;   // 1 year, immutable
export const APP_SECRET_KEYS = [
  'PAYMENT_GATEWAY_PRIVATE_KEY', 'PAYMENT_GATEWAY_INTEGRITY_SECRET',
  'PAYMENT_GATEWAY_EVENTS_SECRET', 'SMTP_USER', 'SMTP_PASSWORD',
] as const;
```

### Deploy environment (read from the root `.env` at synth)

```ts
// infra/lib/config/deploy-env.ts
export interface DeployEnv {
  paymentGatewayUrl: string;        // PAYMENT_GATEWAY_URL  → Lambda env, CSP connect-src, VITE_PAYMENT_GATEWAY_URL
  paymentGatewayPublicKey: string;  // PAYMENT_GATEWAY_PUBLIC_KEY → Lambda env, VITE_PAYMENT_GATEWAY_PUBLIC_KEY
  smtpHost: string; smtpPort: number; emailFrom: string;
}
export function loadDeployEnv(source: Record<string, string | undefined>): DeployEnv;
//   missing or empty key → throws `Missing deploy variable: <NAME>`
//   tests pass { PAYMENT_GATEWAY_URL: 'https://gateway.example.test', … }
```

### Stack contracts

```ts
// CheckoutDataStack → outputs consumed by the backend stack
interface DataStackOutputs {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbSecret: secretsmanager.ISecret;        // db-credentials (RDS-generated JSON)
  appSecrets: secretsmanager.ISecret;      // app-secrets
}

// CheckoutBackendStack props
interface BackendStackProps extends StackProps, DataStackOutputs {
  deployEnv: DeployEnv;
  lambdaBundlePath: string;                // apps/api/dist-lambda (tests: fixtures/lambda-bundle)
}
// → exposes httpApi (for the frontend origin)

// CheckoutFrontendStack props
interface FrontendStackProps extends StackProps {
  httpApi: apigwv2.IHttpApi;
  deployEnv: DeployEnv;                    // gateway URL for the CSP
  webDistPath: string;                     // apps/web/dist (tests: fixtures/web-dist)
}
// outputs: CloudFrontUrl, ApiUrl
```

### API Lambda environment

| Variable | Source |
|---|---|
| `NODE_ENV=production`, `PORT=3000`, `LOG_LEVEL=info`, `DB_NAME=checkout`, `DB_SSL=true` | constants in the backend stack |
| `DB_SECRET_ARN`, `APP_SECRETS_ARN` | CDK references |
| `PAYMENT_GATEWAY_URL`, `PAYMENT_GATEWAY_PUBLIC_KEY`, `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM` | `DeployEnv` |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` | `db-credentials` at cold start |
| `PAYMENT_GATEWAY_PRIVATE_KEY`, `…_INTEGRITY_SECRET`, `…_EVENTS_SECRET`, `SMTP_USER`, `SMTP_PASSWORD` | `app-secrets` at cold start |

```ts
// apps/api/src/shared/infrastructure/aws/load-secrets.ts
export async function loadSecretsIntoEnv(client: SecretsManagerClient, env: NodeJS.ProcessEnv): Promise<void>;
//   reads DB_SECRET_ARN and APP_SECRETS_ARN, then sets
//   DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD from { host, port, username, password }
//   and every APP_SECRET_KEYS entry from app-secrets
//   a missing key → throws naming the key only, never the value
```

The migrator uses the same `loadSecretsIntoEnv` and the same `DB_SSL`.

### CloudFront

| Behavior | Origin | Cache | Function | Headers policy |
|---|---|---|---|---|
| `/*` (default) | S3 (OAC) | CachingOptimized | `spa-rewrite` | `StrictSpaHeaders` (override, full §5 CSP with `connect-src 'self' <gateway URL>`) |
| `/images/*` | S3 (OAC) | 1 year immutable | `spa-rewrite` (passes paths with an extension) | `StrictSpaHeaders` |
| `/api/*` | HTTP API | CachingDisabled + AllViewerExceptHostHeader | — | `ApiHeaders` (HSTS, Referrer-Policy, Permissions-Policy; no override, no CSP) |

```js
// infra/lib/functions/spa-rewrite.js — viewer-request
//   '/products/abc'        → '/index.html'
//   '/assets/app-3f9c.js'  → unchanged
//   '/'                    → '/index.html'
```

## Implementation plan

Prerequisites (not commits):

- The `soundhub` AWS profile is valid (`aws sts get-caller-identity --profile soundhub`).
- The root `.env` has real sandbox values for `PAYMENT_GATEWAY_URL`, `PAYMENT_GATEWAY_PUBLIC_KEY`, `SMTP_HOST`, `SMTP_PORT` and `EMAIL_FROM`.
- `/spec-impl` creates and switches to `spec-09-infra-first-deploy` (`AutoCreateBranch: true`).
- SPEC 08 may run in parallel in its own worktree.

Each step is one commit after review. Target: ≤ ~300 changed lines per step.

**AWS rule:** before any command that creates, modifies or destroys AWS resources, Claude states the price and waits for explicit approval. Read-only commands (`synth`, `diff`, `describe-*`) need no approval. Pushing and opening PRs happen only when the user asks.

### Part 1 — Data stack

1. [x] **CDK skeleton.** `infra/{package.json, tsconfig.json, cdk.json, jest.config.ts}`, `bin/app.ts` with three empty stacks, `lib/config/constants.ts` and `lib/config/deploy-env.ts`, plus `deploy-env.test.ts`. The test covers:
   - every value is read;
   - a missing or empty key throws naming it;
   - `SMTP_PORT` is parsed as a number.

   Manual test: `pnpm --filter @checkout/infra exec cdk synth` prints 3 empty templates, and `pnpm lint` / `typecheck` are green.
   Commit: `chore(infra): scaffold CDK app and deploy env loader`.

2. [x] **CI job.** Add the `infra` job to `.github/workflows/ci.yml`, running `pnpm --filter @checkout/infra test`.
   Manual test: `pnpm --filter @checkout/infra test` is green locally.
   Commit: `ci: run infra tests`.

3. [x] **Network.** In `CheckoutDataStack`: VPC with 2 AZs and 3 subnet tiers, the NAT instance t4g.nano through `NatProvider.instanceV2`, and the exported `LambdaSecurityGroup`. `data-stack.test.ts` asserts:
   - 0 `AWS::EC2::NatGateway` and 1 `AWS::EC2::Instance` of type `t4g.nano`;
   - 6 subnets in 2 AZs;
   - the project tag on the VPC.

   Manual test: `test` green, and `cdk synth CheckoutDataStack` contains no `NatGateway`.
   Commit: `feat(infra): add VPC with NAT instance`.

4. [ ] **Database and secrets.** RDS PostgreSQL 16 with its parameter group (`rds.force_ssl=1`), the `db-credentials` secret, the security group rule (5432 only from `LambdaSecurityGroup`), the `app-secrets` placeholders and the destroy policies. The tests assert:
   - `PubliclyAccessible: false`, isolated subnets, `db.t4g.micro`, 20 GB gp3, 1-day backups;
   - `rds.force_ssl: '1'`;
   - exactly one ingress on 5432, sourced from the Lambda security group;
   - `DeletionPolicy: Delete`, no deletion protection, secrets without a recovery window;
   - `app-secrets` has the 5 expected keys.

   Manual test: `test` green.
   Commit: `feat(infra): add private RDS PostgreSQL and app secrets`.

5. [ ] **Bootstrap, budget and data deploy.** `infra/README.md` gets the profile, bootstrap, budget, `deploy CheckoutDataStack`, set-secrets and destroy commands. Then, each with its price and explicit approval:
   - `cdk bootstrap` (~USD 0.01/month);
   - the AWS Budgets alert at USD 30/month (free);
   - `cdk deploy CheckoutDataStack` (~USD 23/month from now on);
   - `aws secretsmanager put-secret-value` for `app-secrets`, which the user runs in their own terminal.

   Manual test:
   - `aws rds describe-db-instances` shows `PubliclyAccessible: false`;
   - the endpoint resolves only to a private IP.

   Commit: `docs(infra): add data stack deploy guide`.

### Part 2 — Backend and frontend

6. [ ] **Database SSL.** Add `DB_SSL` to `environment-variables.ts` (optional, default `false`), `db.ssl` to `app-config.ts`, and the `ssl` option in `buildDataSourceOptions`, which reads `certs/rds-global-bundle.pem`. The unit specs cover:
   - no `ssl` key when false;
   - `{ ca, rejectUnauthorized: true }` when true;
   - `DB_SSL=yes` → validation error.

   Manual test: `pnpm dev` still boots against docker Postgres without SSL, and `test:int` is green.
   Commit: `feat(api): support SSL to RDS behind DB_SSL`.

7. [ ] **Secrets loader.** `shared/infrastructure/aws/load-secrets.ts` with a spec over a fake `SecretsManagerClient`. The spec covers:
   - both secrets mapped to the `.env` names;
   - a missing ARN, secret key or field throws naming the key without its value;
   - a second call in the same process does not fetch again.

   Adds `@aws-sdk/client-secrets-manager`.
   Manual test: `test` green.
   Commit: `feat(api): load AWS secrets into env at cold start`.

8. [ ] **Lambda entry points.** `lambda.ts`: `loadSecretsIntoEnv` → `NestFactory.create` → `configureApp` → `serverlessExpress`, cached in a module-level promise. `workers/migrator.handler.ts`: `loadSecretsIntoEnv` → a `DataSource` with `[InitialSchema1790463118000]` → `runMigrations()` → `runSeed()` → returns the summary. Adds `@codegenie/serverless-express` and `@types/aws-lambda`.
   Manual test: `typecheck` green.
   Commit: `feat(api): add Lambda handler and migrator entry points`.

9. [ ] **Lambda bundle.** `webpack.lambda.config.cjs`, `scripts/copy-lambda-assets.ts`, `certs/rds-global-bundle.pem` and the `build:lambda` script (output `dist-lambda/`, git-ignored).
   Manual test: `build:lambda`, then a local smoke run against docker Postgres. `node` requires `dist-lambda/lambda.js` and invokes `handler` with a sample HTTP API event for:
   - `GET /api/v1/health` → 200 `database: 'up'`;
   - `GET /api/docs` → HTML;
   - `GET /api/docs-json` → schemas present for `ProductDetailDto`.

   Record the bundle size.
   Commit: `build(api): bundle NestJS for Lambda with webpack`.

10. [ ] **Backend stack.** API Lambda, HTTP API with throttling, migrator Lambda with `triggers.Trigger`, log retention and secret grants. `backend-stack.test.ts` asserts:
    - arm64, `nodejs22.x`, 1024 MB, VPC config with the Lambda security group, and no `ReservedConcurrentExecutions`;
    - throttling 50 / 100;
    - the trigger depends on the migrator;
    - the IAM policy grants `GetSecretValue` only on the 2 secret ARNs;
    - log retention 14 days;
    - no secret value appears in any environment variable.

    Manual test: `test` green.
    Commit: `feat(infra): add API and migrator Lambdas behind an HTTP API`.

11. [ ] **SPA rewrite function.** `lib/functions/spa-rewrite.js` with `spa-rewrite.test.ts`, which runs the function body against sample events:
    - `/products/abc` and `/` → `/index.html`;
    - `/assets/x.js`, `/images/products/y.webp` and `/favicon.ico` → unchanged.

    Manual test: `test` green.
    Commit: `feat(infra): add SPA rewrite CloudFront function`.

12. [ ] **Frontend stack.** Private bucket with OAC, the distribution with the 3 behaviors, the 2 headers policies and the `BucketDeployment`. `frontend-stack.test.ts` asserts:
    - the bucket blocks public access;
    - `/api/*` uses `CachingDisabled` and `AllViewerExceptHostHeader`, with no function association;
    - the function is associated only with the S3 behaviors;
    - `StrictSpaHeaders` has override and the CSP with the injected fake gateway URL;
    - `ApiHeaders` has no CSP and no override;
    - there is no custom error response.

    Manual test: `test` green.
    Commit: `feat(infra): add CloudFront distribution for SPA and API`.

13. [ ] **Build-and-deploy and first full deploy.** A `deploy` script in `infra`:
    1. build the web with `VITE_API_BASE_URL=/api/v1`, `VITE_API_MOCKING=false` and the `VITE_*` values from `.env`;
    2. `build:lambda`;
    3. `cdk deploy --all`.

    `infra/README.md` records the outputs and the Postman `{{baseUrl}}`. Then, with its price and explicit approval: `pnpm --filter @checkout/infra deploy`.
    Manual test (against the CloudFront URL):
    - `/api/v1/health` → `{ status: 'ok', database: 'up' }`;
    - refreshing `/products/<id>` renders the SPA;
    - `/api/v1/products/<unknown-uuid>` → JSON 404;
    - `/api/docs` renders Swagger with schemas;
    - response headers match §5 on `/` and on `/api/v1/health`.

    Commit: `feat(infra): add build-and-deploy script and record outputs`.

### Close-out

14. [ ] **Evidence and PR.**
    - Run Mozilla Observatory on the CloudFront URL (target A, findings listed if lower).
    - Note the API Lambda cold start (the `Init Duration` of the first REPORT line in CloudWatch) and the bundle size.
    - Check the quota request status.
    - When the user asks, push and open the PR with `gh-cli` with those numbers, wait for CI and fix whatever fails.
    - Mark this spec `Implemented`.

    Manual test: every check green.
    Commit: `docs: mark spec 09 as Implemented`.

Notes:

- The stacks stay deployed after step 13, at ~USD 23/month. `cdk destroy` runs only when the user decides, with confirmation.
- A CI fix in step 14 goes in its own `fix: …` commit, after review.
- If SPEC 08 merges first and `pnpm-lock.yaml` conflicts, apply the lockfile protocol.

## Acceptance criteria

Data stack

- [ ] `cdk deploy CheckoutDataStack` succeeds with the `soundhub` profile.
- [ ] `aws rds describe-db-instances` reports `PubliclyAccessible: false`, engine `postgres` 16, class `db.t4g.micro`, 20 GB gp3, 1-day backup retention.
- [ ] The RDS endpoint resolves only to a private (10.x) address, and a `psql` attempt from the laptop times out.
- [ ] `cdk synth` output contains no `AWS::EC2::NatGateway`, and it contains one `t4g.nano` NAT instance.
- [ ] The only ingress rule on 5432 has the Lambda security group as its source.
- [ ] A connection without SSL is rejected (`rds.force_ssl=1` is in effect).
- [ ] `app-secrets` exists with the 5 expected keys, and no real value appears in git, the templates or the CI logs.

Backend

- [ ] `https://<distribution>.cloudfront.net/api/v1/health` returns 200 `{ data: { status: 'ok', database: 'up' } }`.
- [ ] The migrator trigger runs on every deploy. After the first deploy `GET /api/v1/products` returns the 15 seeded products, and a second deploy leaves the counts unchanged.
- [ ] The API Lambda runs arm64, `nodejs22.x`, 1024 MB, inside the private subnets, with no reserved concurrency.
- [ ] The Lambda configuration's environment variables contain no secret value (`aws lambda get-function-configuration` shows only ARNs and non-secret values).
- [ ] The Lambda's IAM role can read only the 2 secret ARNs.
- [ ] `/api/docs` renders Swagger UI with the DTO schemas, and `/api/docs-json` lists `ProductDetailDto` with its properties.

Frontend

- [ ] Refreshing `https://<distribution>.cloudfront.net/products/<id>` in the browser renders the SPA product page.
- [ ] `https://<distribution>.cloudfront.net/api/v1/products/<unknown-uuid>` returns a JSON 404 `PRODUCT_NOT_FOUND`, not HTML.
- [ ] `/images/products/<sku>-640.webp` returns the image with a 1-year immutable `Cache-Control`.
- [ ] The S3 bucket is not publicly reachable (the direct bucket URL returns 403).
- [ ] `/` carries HSTS, the §5 CSP (with the gateway URL in `connect-src`), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
- [ ] `/api/v1/health` carries HSTS and helmet's CSP (not the SPA one), and `/api/docs` works without CSP errors in the console.
- [ ] The SPA in AWS calls the real API (`VITE_API_MOCKING=false`): the product list shows the RDS data.

Tests, CI and repo hygiene

- [ ] `pnpm --filter @checkout/infra test` passes with no AWS credentials and no prior build.
- [ ] The CI `infra` job runs and is green on the PR, together with `lint`, `typecheck`, `coverage (api)` and `api-integration`.
- [ ] `apps/api` coverage stays ≥ 80 % on all four metrics. `lambda.ts` and `migrator.handler.ts` are the only new coverage exclusions.
- [ ] `git grep -i` for the gateway brand name and for the sandbox host returns nothing in the diff.
- [ ] `cdk.out/` and `apps/api/dist-lambda/` are git-ignored.

Operations and evidence

- [ ] `infra/README.md` lists the exact commands for the profile, bootstrap, budget, deploy, set-secrets, outputs, destroy, deployer-key deactivation and the quota-request check. It also records the CloudFront and API URLs and the Postman `{{baseUrl}}`.
- [ ] An AWS Budgets alert at USD 30/month exists.
- [ ] Mozilla Observatory result recorded in the PR (target A; findings listed if lower).
- [ ] The API Lambda cold start (`Init Duration`) and the bundle size are recorded in the PR.
- [ ] `cdk destroy --all`, when run, leaves no stack, RDS instance, snapshot, secret or bucket behind. It is verified only when the user decides to destroy.

## Decisions

Spec shape

- **Yes:** one spec covering both parts of the phase, with Part 1 deployable and verifiable on its own (step 5). The parallelization plan assumes one PR for infra 05, and SPEC 06 set the precedent.
- **No:** two specs. That means two review and CI cycles, and Part 1 alone does not prove the main risk (Nest in Lambda).
- **Yes:** branch `spec-09-infra-first-deploy`, created by `/spec-impl`, not `feat/05-infra-first-deploy`.

AWS access and operations

- **Yes:** a dedicated `soundhub` profile (IAM user `soundhub-deployer` with `AdministratorAccess`). It is the fastest path, and CDK bootstrap needs to create IAM roles. The access key is deactivated after the evaluation, and the README has the command.
- **No:** the `default` profile, whose keys are dead (`InvalidClientTokenId`). Also no IAM Identity Center for now: it adds 15–20 min of setup and repeated logins during deploys.
- **Yes:** Claude runs AWS commands through Bash, but states the price and waits for explicit approval before any create, modify or destroy. Read-only commands run freely.
- **Yes:** accept ≈ USD 23/month only during development and evaluation, with a USD 30/month AWS Budgets alert and `cdk destroy` at the end. The budget is created once through the CLI, outside the stacks, so it outlives a destroy and still catches leftovers.
- **No:** destroying between sessions (~20 min redeploy each time), Aurora Serverless v2 (more expensive when active, and slow to resume), or a public RDS (it breaks a non-negotiable).

Concurrency

- **Yes:** no reserved concurrency on the API Lambda in this spec. The account's concurrency limit is 10, and AWS keeps at least 10 unreserved, so any reservation fails the deploy. The account limit already caps containers at 10 (≤ 20 DB connections).
- **Yes:** a quota increase to 1000 was requested on 2026-09-27 (request `5748b3c72b314c8fb36167d73d5adc52YXKB9cGl`, free). Reserved concurrency 10 lands in infra 09 once it is approved.

Secrets and configuration

- **Yes:** `lambda.ts` reads `db-credentials` and `app-secrets` once per container and copies them into `process.env` under the `.env` names, so `EnvironmentVariables` validates exactly as in local. This costs ~100–200 ms on the cold start only.
- **No:** the Parameters and Secrets Lambda Extension (one more moving piece for no gain at this volume). **No:** secrets as Lambda environment variables (plaintext in the console).
- **Yes:** non-secret deploy values (gateway URL and public key, SMTP host, port and from) come from the root git-ignored `.env`, read at synth with `node:util` `parseEnv`. The sandbox host contains the gateway's brand, which must never be committed. Tests use `https://gateway.example.test`.
- **No:** CDK context flags on every command (long and error-prone), or SSM Parameter Store (extra manual setup).
- **Yes:** `app-secrets` is created by CDK with placeholder values and filled by hand with `put-secret-value` in the user's own terminal. Real values never pass through the chat, git or templates.

Database connection

- **Yes:** `DB_SSL=true` in AWS only, with `ssl: { ca: rds-global-bundle.pem, rejectUnauthorized: true }`. It encrypts and verifies the server identity. The public CA bundle ships with the Lambda. `DB_SSL` is a genuine per-environment value, so the env var respects C2.
- **No:** `rejectUnauthorized: false`. It is encrypted but unverified, which an auditor flags.
- **Yes:** touching `data-source.ts`, `app-config.ts` and `environment-variables.ts` although they are outside the phase's Owns. `rds.force_ssl=1` makes the deployed API unusable without it, and the change is additive, defaulting to off.

Bundling

- **Yes:** the existing Nest CLI webpack builder with a `webpack.lambda.config.cjs`. ts-loader emits the decorator metadata Nest's DI needs, and the Swagger CLI plugin keeps generating DTO schemas, so AWS Swagger equals local Swagger.
- **No:** esbuild, as the phase text says. It emits no decorator metadata, and it cannot run the Swagger plugin. The workarounds are an SWC plugin plus hand-written `@ApiProperty` in `modules/**` (forbidden here), or an empty Swagger in AWS.
- **Yes:** `node.__dirname = false`, plus copying `swagger-ui-dist` assets and the CA bundle into `dist-lambda/`, so runtime path lookups work inside the bundle.
- **Yes:** the migrator imports migration classes explicitly. The `*.ts` glob in `data-source.ts` does not exist inside a bundle.

Networking and edge

- **Yes:** a NAT instance (t4g.nano, ~USD 7/month with its public IPv4) instead of a NAT Gateway (~USD 35/month), as designed in `04-aws-architecture.md` §4.
- **Yes:** two Response Headers Policies. S3 gets the strict §5 set with override, which is what Observatory grades. `/api/*` gets HSTS, Referrer and Permissions without override and without CSP, so helmet keeps its per-path CSP and Swagger UI's inline scripts work.
- **No:** one policy with override everywhere. It would blank `/api/docs`, a deliverable.
- **Yes:** the SPA rewrite function only on the S3 behaviors. **No:** a distribution-wide 403/404 → `index.html`, which would turn API 404s into HTML.
- **Yes:** the default `*.cloudfront.net` domain (free HTTPS). **No:** a custom domain.
- **Yes:** product images ship inside `apps/web/dist` (they live in `apps/web/public/images/products`), so one `BucketDeployment` covers both.

Teardown

- **Yes:** `RemovalPolicy.DESTROY` everywhere. RDS gets no final snapshot and no deletion protection, secrets get no recovery window, and the bucket auto-deletes. After `cdk destroy` the cost is exactly USD 0, and the sandbox data is recreated by the seed.
- **No:** a final RDS snapshot. It keeps billing until someone deletes it by hand.

Tests and CI

- **Yes:** assertion tests on synthesized templates, with a fixed fake account and region, no context lookups, and asset paths injected as props. They need no AWS, no credentials and no build, and they create nothing.
- **Yes:** a new `infra` job in `ci.yml`. It is outside the phase's Owns, but no parallel phase edits that file now, and it enforces the security assertions on every PR.
- **No:** a coverage threshold for `infra`. The 80 % rule binds only `apps/web` and `apps/api`.
- **Yes:** `lambda.ts` and `migrator.handler.ts` are coverage-excluded bootstrap files (`references/testing.md`). Their logic lives in `load-secrets.ts` and `data-source.ts`, which are tested.
- **Yes:** a local smoke run of the built Lambda bundle (step 9) before any AWS deploy. Bundling bugs surface at no cost.

Postman and Swagger

- **Yes:** the CloudFront URL is recorded as the Postman `{{baseUrl}}` for the AWS environment. The collection itself belongs to api 07, and the root README links it in infra 09.

Workflow

- **Yes:** push and PR only when the user asks.

## Risks

| Risk | Mitigation |
| --- | --- |
| The webpack Lambda bundle breaks at runtime: an optional module Nest `require`s dynamically, `swagger-ui-dist` paths, `pg-native`, or TypeORM driver detection. | Step 9's local smoke run invokes the real bundle against docker Postgres before any deploy. Unused optional modules go through `IgnorePlugin` and are listed in the config. The runtime paths use `node.__dirname = false` plus copied assets. |
| Cold start is too slow (NestJS + TypeORM + Secrets Manager + SSL handshake) and the first request exceeds API Gateway's 29 s limit, or feels slow to the user. | 1024 MB (more CPU), arm64, and secrets fetched in parallel. The first REPORT's `Init Duration` is measured in step 14. If it is above ~3 s, the fixes go in infra 09 as a separate spec (provisioned concurrency is out of budget). |
| The NAT instance fails or is replaced, so the Lambdas lose outbound internet: no Secrets Manager at cold start, and no gateway calls. | Accepted trade-off (§4). The database keeps working. A redeploy recreates the instance. The README includes a check (`describe-instances`). |
| Cold starts inside a VPC cannot reach Secrets Manager because of route or security-group errors, so every request fails with a timeout. | Backend stack tests assert private-with-egress subnets and a default route to the NAT. The step 13 manual test hits `/health` first. A VPC interface endpoint for Secrets Manager (~USD 7/month per AZ) is discarded on cost. |
| The migrator trigger fails (migration error, SSL, timeout) and rolls back the whole backend stack deploy. | That is the intended safety. Its logs are in CloudWatch, the timeout is 300 s, and the migrations are idempotent, so a redeploy retries. |
| The account's Lambda concurrency stays at 10: a burst, or infra 06's extra Lambdas, cause throttling (429 / 503). | The quota increase was requested on 2026-09-27. Its status is checked in step 14. Demo traffic is far below 10 concurrent. |
| Real sandbox values leak: the brand host in a committed file, the CSP in a test snapshot, or a secret in a Lambda env var or in the chat. | `.env` stays git-ignored, and `cdk.out/` is ignored. Tests use `gateway.example.test`, with no snapshot tests of the full template. A backend test asserts no secret in the environment. The user types secrets only in their own terminal. The `git grep` acceptance criterion catches leaks. |
| The long-lived admin access key of `soundhub-deployer` is exposed. | It is used only locally. The README has the deactivation command, and it is deactivated after the evaluation. |
| Costs creep past the estimate (a forgotten stack, NAT data transfer, logs). | The USD 30/month Budgets alert, created outside the stacks. Log retention is 14 days. There is a final `cdk destroy`. |
| SPEC 08 (in parallel) merges first and `pnpm-lock.yaml` conflicts. | Apply the lockfile protocol: `git checkout main -- pnpm-lock.yaml && pnpm install`. |
| `node:util` `parseEnv` is missing from the Node version that runs CDK. | Available since Node 20.12 / 21.7. The repo runs Node 22+ locally (v26) and in CI. |
| The CloudFront `/api/*` origin mangles the path or headers: API Gateway expects no `Host` rewrite, and the stage path must not be prefixed. | The `$default` stage, no path prefix, and `AllViewerExceptHostHeader`. The step 13 manual test covers `health`, a 404 and `/api/docs`. |

## What is **not** in this spec

- SQS + DLQ, EventBridge Scheduler, email worker, reconciler Lambda and CloudWatch alarms (infra 06).
- Reserved concurrency on the API Lambda (infra 09, after the quota increase).
- The per-IP limit on `POST /api/v1/transactions`, and WAF (api 07 / stretch).
- The Postman collection (api 07) and the root README (infra 09).
- CI deployment through GitHub OIDC (stretch).
- A custom domain, provisioned concurrency, or VPC endpoints.
- Any change to `apps/api/src/modules/**` or `apps/web/src/**`.

Each of these, if it lands, goes in its own spec.
