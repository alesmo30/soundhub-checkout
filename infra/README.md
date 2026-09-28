# infra

AWS CDK (TypeScript) app that deploys SoundHub's sandbox environment: a
private VPC, RDS PostgreSQL, the API Lambda behind an HTTP API, and a
CloudFront distribution serving the SPA. Region `us-east-1`. Every resource
is tagged `project=headphones-checkout` and every stack name is prefixed
`Checkout`.

Besides `CheckoutDataStack` (VPC, NAT instance, RDS, `db-credentials` and
`app-secrets`), it also deploys `CheckoutBackendStack` (API + migrator
Lambdas behind an HTTP API) and `CheckoutFrontendStack` (S3 + CloudFront
serving the SPA and proxying `/api/*` to the HTTP API).

## Prerequisites

- AWS CLI v2 installed (`aws --version`).
- Node 22+ and pnpm (see root `package.json`).
- A named AWS profile called `soundhub`, backed by the `soundhub-deployer`
  IAM user (`AdministratorAccess` — CDK bootstrap needs to create IAM
  roles):

  ```bash
  aws configure --profile soundhub
  ```

  Verify it resolves an account:

  ```bash
  aws sts get-caller-identity --profile soundhub
  ```

- The root `.env` has real sandbox values for `PAYMENT_GATEWAY_URL`,
  `PAYMENT_GATEWAY_PUBLIC_KEY`, `SMTP_HOST`, `SMTP_PORT` and `EMAIL_FROM`
  (`cdk synth` fails fast, naming any missing variable). This file is
  git-ignored; the payment gateway's brand name must never be committed.

All commands below run from the repo root unless noted otherwise. `cdk`
resolves the AWS account and region from `--profile soundhub` and injects
them as `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` — no account ID is
hardcoded anywhere in this repo.

## 1. Bootstrap

One-time per account/region. Creates the CDK toolkit stack (an S3 bucket
for asset staging plus a handful of small supporting resources).

**Cost: ~USD 0.01/month** (a near-empty S3 bucket; negligible unless
assets pile up).

```bash
pnpm --filter @checkout/infra exec cdk bootstrap --profile soundhub
```

## 2. AWS Budgets alert

Created once via the CLI, outside the CDK stacks, so it outlives a
`cdk destroy` and still catches any leftover resource. **Cost: free.**

```bash
aws budgets create-budget \
  --profile soundhub \
  --account-id "$(aws sts get-caller-identity --profile soundhub --query Account --output text)" \
  --budget '{
    "BudgetName": "soundhub-sandbox-monthly",
    "BudgetLimit": { "Amount": "30", "Unit": "USD" },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80,
        "ThresholdType": "PERCENTAGE"
      },
      "Subscribers": [
        { "SubscriptionType": "EMAIL", "Address": "<your-email>" }
      ]
    }
  ]'
```

Replace `<your-email>` with the account's contact address. This fires at 80%
of the USD 30 budget (USD 24), well before the ~USD 23/month steady-state
cost below.

## 3. Deploy the data stack

```bash
pnpm --filter @checkout/infra exec cdk deploy CheckoutDataStack --profile soundhub
```

**Cost: ~USD 23/month while it exists**, roughly:

| Resource | ~USD/month |
|---|---|
| RDS db.t4g.micro (single-AZ) | ~12 |
| RDS gp3 20 GB storage + 1-day backups | ~2.5 |
| NAT instance t4g.nano + its public IPv4 | ~7 |
| Secrets Manager (2 secrets) | ~0.8 |
| **Total** | **~22–23** |

These are rough, rounded estimates. The real number is confirmed after
deploy in AWS Cost Explorer.

## 4. Set the app secrets by hand

`app-secrets` is created by CDK with placeholder values. Real values are
never committed, never pasted into chat, and never set by Claude — **run
this command yourself, in your own terminal**, after the stack above is
deployed:

```bash
aws secretsmanager put-secret-value \
  --secret-id app-secrets \
  --profile soundhub \
  --secret-string '{"PAYMENT_GATEWAY_PRIVATE_KEY":"<value>","PAYMENT_GATEWAY_INTEGRITY_SECRET":"<value>","PAYMENT_GATEWAY_EVENTS_SECRET":"<value>","SMTP_USER":"<value>","SMTP_PASSWORD":"<value>"}'
```

Replace every `<value>` with the real sandbox secret. All five keys must be
present in the JSON blob — a partial update overwrites the whole secret
value, not just the keys you name.

## 5. Verify the deploy

RDS must not be publicly reachable:

```bash
aws rds describe-db-instances \
  --profile soundhub \
  --query "DBInstances[*].{Id:DBInstanceIdentifier,Public:PubliclyAccessible,Endpoint:Endpoint.Address}"
```

Expect `Public: false`. The endpoint hostname should resolve only to a
private (`10.x`) address — confirm with `dig` or `nslookup` against the
returned endpoint, and note that a `psql` connection attempt from your
laptop times out (there is no route from the public internet into the
isolated subnet).

## 6. Build and deploy everything (data + backend + frontend)

`pnpm --filter @checkout/infra run deploy` runs `infra/scripts/deploy.sh`, which:

1. builds `apps/web` with `VITE_API_BASE_URL=/api/v1` and
   `VITE_API_MOCKING=false` (the other `VITE_*` values — payment gateway URL
   and public key — are read from the root `.env`, same as local dev);
2. builds the API Lambda bundle (`pnpm --filter @checkout/api build:lambda`);
3. runs `cdk deploy --all --profile soundhub`, deploying `CheckoutDataStack`,
   `CheckoutBackendStack` and `CheckoutFrontendStack` in dependency order.

Step 3 is interactive on purpose — it does **not** pass
`--require-approval never`, so CDK stops and shows every IAM/security-group
change before applying it. Confirm each prompt by hand.

**Cost: ~USD 23–25/month total**, essentially unchanged from the data-stack
cost in step 3 above. CloudFront and S3 have generous free tiers at this
traffic volume, the HTTP API is USD 1 per million requests, and both Lambdas
(API + migrator) run well within the Lambda free tier. The delta over the
data-stack-only estimate is small and dominated by rounding, not by new
paid resources.

```bash
pnpm --filter @checkout/infra run deploy
```

Run this only after confirming the price above and getting explicit
approval — it deploys real AWS resources.

### Stack outputs and the Postman `{{baseUrl}}`

After a successful deploy, read the outputs from the frontend and backend
stacks:

```bash
aws cloudformation describe-stacks \
  --stack-name CheckoutFrontendStack \
  --profile soundhub \
  --query "Stacks[0].Outputs"

aws cloudformation describe-stacks \
  --stack-name CheckoutBackendStack \
  --profile soundhub \
  --query "Stacks[0].Outputs"
```

The frontend stack's `CloudFrontUrl` output is the entry point for the
deployed environment — the SPA is served from it, and it proxies `/api/*`
to the HTTP API. The backend stack's `ApiUrl` output is the HTTP API's own
invoke URL, useful for isolated backend checks but not the URL end users
(or Postman) should hit.

`CloudFrontUrl` is the Postman `{{baseUrl}}` for the AWS environment. The
Postman collection itself lives with api spec 07; the root README links it.

- `CloudFrontUrl`: https://d2dponv42xzzpw.cloudfront.net
- `ApiUrl`: https://rz9wrfmlj8.execute-api.us-east-1.amazonaws.com

### Evidence (first deploy, 2026-09-28)

- Mozilla Observatory: **A+** (score 125/100, 12/12 tests passed).
- API Lambda cold start (`Init Duration`, first `REPORT` line): **595.62 ms**.
- Lambda bundle size: `lambda.js` 4.6 MB, `migrator.js` 4.7 MB, `dist-lambda/` total 27 MB.
- Lambda concurrency quota increase (request `5748b3c72b314c8fb36167d73d5adc52YXKB9cGl`): **approved**, limit is now 1000. Reserved concurrency itself stays out of this spec's scope (infra 09).

### Release (2026-09-28)

First deploy of the async half (SPEC 13: SQS + DLQ, email worker, reconciler,
Scheduler, SNS alarms), on top of the `spec-16-infra-release` branch. Stack
outputs unchanged from the section above (`CloudFrontUrl`, `ApiUrl`).

- 4 Lambdas confirmed: API (reserved concurrency **10**), migrator, email
  worker, reconciler.
- `transaction-finalized` queue and its DLQ exist; the reconciler schedule is
  `ENABLED` (rate: 1 minute).
- SNS subscription to the alarm email confirmed.
- `/api/v1/health` → `{ status: 'ok', database: 'up' }`.
- `/api/docs-json` lists every route in `main` except
  `/api/v1/webhooks/payments`, deliberately hidden with `@ApiExcludeEndpoint`
  since SPEC 12a — the route exists and works, it just isn't public API
  documentation. See spec 16, step 3 decisions.
- This deploy surfaced and fixed three real bugs left by SPEC 13's own
  deploy (never run before this spec): the email worker and reconciler
  Lambda `handler` strings duplicated `.handler` (`Runtime.HandlerNotFound`);
  both were missing several required plain env vars (`NODE_ENV`, `PORT`,
  `LOG_LEVEL`, and per-Lambda `SMTP_*`/`PAYMENT_GATEWAY_*`); the API Lambda
  never set `EVENT_PUBLISHER_DRIVER=sqs`, so it silently used the in-memory
  no-op publisher instead of actually enqueueing finalized transactions.
  Verified fixed via CloudWatch logs after redeploy.
- `app-secrets` in Secrets Manager had never been rotated past its
  `placeholder` scaffold value since `CheckoutDataStack` was first created —
  updated by hand with the real payment gateway and SMTP credentials before
  this deploy (see spec 16, step 3 decisions).

## 7. Destroy

Destructive. Only run this when you decide to tear the sandbox down —
there is no final RDS snapshot and no deletion protection, so the data is
gone for good. Once the backend and frontend stacks have been deployed,
`cdk destroy --all` tears down all three stacks (data, backend, frontend),
not just the data stack.

```bash
pnpm --filter @checkout/infra exec cdk destroy --all --profile soundhub
```

**Secrets Manager recovery-window nuance:** CloudFormation (and therefore
`cdk destroy`) has no property to force an immediate, unrecoverable secret
deletion — a stack deletion schedules both `db-credentials` and
`app-secrets` for deletion after AWS's default recovery window, even though
the stack's `RemovalPolicy` is `DESTROY`. If you need to redeploy right
away and reuse the same secret names, delete each one immediately by hand:

```bash
aws secretsmanager delete-secret \
  --secret-id db-credentials \
  --force-delete-without-recovery \
  --profile soundhub

aws secretsmanager delete-secret \
  --secret-id app-secrets \
  --force-delete-without-recovery \
  --profile soundhub
```

Otherwise the secret names stay reserved (pending deletion) for the
duration of the recovery window, and a redeploy that tries to recreate a
secret with the same name fails.
