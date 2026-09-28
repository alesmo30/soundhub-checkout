# infra

AWS CDK (TypeScript) app that deploys SoundHub's sandbox environment: a
private VPC, RDS PostgreSQL, and (in later steps of this spec) the API
Lambda, HTTP API and CloudFront distribution. Region `us-east-1`. Every
resource is tagged `project=headphones-checkout` and every stack name is
prefixed `Checkout`.

This section covers **`CheckoutDataStack`** only (VPC, NAT instance, RDS,
`db-credentials` and `app-secrets`). The backend and frontend stacks land in
later steps of spec 09 and will extend this README with their own deploy,
outputs and destroy commands.

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

## 6. Destroy

Destructive. Only run this when you decide to tear the sandbox down —
there is no final RDS snapshot and no deletion protection, so the data is
gone for good.

```bash
pnpm --filter @checkout/infra exec cdk destroy CheckoutDataStack --profile soundhub
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

## What's next

Steps 6–13 of spec 09 add the backend Lambda + HTTP API and the frontend
CloudFront distribution, a combined `deploy` script (`cdk deploy --all`),
and the stack outputs (CloudFront URL, API URL). This README will grow to
cover those once those steps land.
