# Design 04 — AWS Architecture

Region: `us-east-1`. Everything is defined with AWS CDK (TypeScript) in `infra/`.

## 1. Diagram

```
                          Browser (SPA)
                               │  HTTPS (*.cloudfront.net)
                  ┌────────────▼──────────────┐        (optional)
                  │        CloudFront         │◄────── AWS WAF: managed rules +
                  │  Response Headers Policy  │        per-IP rate limit on POST /transactions
                  │  SPA rewrite function     │
                  └──────┬───────────┬────────┘
          /* and /images/*           │ /api/*
             ┌───────────▼──┐   ┌────▼──────────────────┐
             │ S3 (private, │   │ API Gateway HTTP API  │  per-route throttling
             │ OAC): SPA +  │   └────┬──────────────────┘
             │ product imgs │        │
             └──────────────┘        │
  ┌──────────────────────── VPC (2 AZs) ┼──────────────────────────────────────┐
  │ Public subnet     │ Private subnet with egress         │ Isolated subnet    │
  │ ┌──────────────┐  │ ┌────────────────────────────────┐ │ ┌───────────────┐  │
  │ │ NAT instance │◄─┼─│ Lambda: API (NestJS)           │─┼►│ RDS Postgres  │  │
  │ │ t4g.nano     │  │ │ Lambda: email worker  ◄── SQS  │─┼►│ 16 t4g.micro  │  │
  │ └──────┬───────┘  │ │ Lambda: reconciler ◄─ Scheduler│─┼►│ not publicly  │  │
  │        │          │ │ Lambda: migrator (on deploy)   │─┼►│ accessible    │  │
  └────────┼──────────┴─┴────────────────────────────────┴─┴─┴───────────────┴──┘
           ▼
   Payment gateway (sandbox) · Gmail SMTP (465) · SQS · Secrets Manager
```

## 2. Components

| Service | Configuration | Purpose |
|---|---|---|
| CloudFront | Default `*.cloudfront.net` domain (free HTTPS). Behaviors: `/*` → S3 (SPA), `/images/*` → S3 (1-year immutable cache), `/api/*` → HTTP API (caching disabled, forwards query strings and headers except `Host`). Response Headers Policy with the security headers below. | Single origin, HTTPS, security headers, fast images |
| CloudFront Function | Viewer-request function attached **only** to the S3 behaviors: a URI without a file extension is rewritten to `/index.html`. | SPA deep links and refreshes, without masking API 404s (see §3) |
| S3 | One private bucket with Origin Access Control. `BucketDeployment` uploads the build and invalidates the cache. Product images under `images/products/`. | SPA + product images |
| API Gateway HTTP API | Lambda proxy integration. Default throttling (e.g. 50 rps / burst 100) and a stricter limit on `POST /api/v1/transactions`. | API entry point |
| Lambda — API | Node 22, arm64, 1024 MB, esbuild bundle, NestJS through `@codegenie/serverless-express`. Reserved concurrency 10; TypeORM pool of 2 reused across invocations. | REST API |
| Lambda — email worker | SQS event source (batch 5, `ReportBatchItemFailures`). | Result emails via Gmail SMTP |
| Lambda — reconciler | EventBridge Scheduler target, `rate(1 minute)`. | Sync PENDING, expire reservations, re-publish missing emails |
| Lambda — migrator | CDK `triggers.Trigger`, runs migrations + seed after each deploy. | The database is private, so it cannot be migrated from a laptop |
| SQS | `transaction-finalized` + DLQ (max 5 receives). Visibility timeout = 6 × worker timeout. | Decouple email sending |
| RDS PostgreSQL 16 | db.t4g.micro, gp3 20 GB, single-AZ, isolated subnet, `rds.force_ssl=1`, 1-day backups, credentials generated in Secrets Manager. | Data |
| VPC | 2 AZs; public / private-with-egress / isolated subnets. NAT **instance** (t4g.nano, `NatProvider.instanceV2`) instead of a NAT Gateway. | Private database; cheap outbound internet for the Lambdas |
| Secrets Manager | `db-credentials` (generated) and `app-secrets` (gateway private key, integrity secret, events secret, SMTP password). Read once per Lambda container. | Secrets never in code or bundles |
| CloudWatch | JSON logs, 14-day retention. Alarms: DLQ depth > 0, Lambda errors. | Observability |
| IAM | Least privilege through CDK `grant*` methods. | Security |
| AWS WAF (optional) | `AWSManagedRulesCommonRuleSet`, `AWSManagedRulesKnownBadInputsRuleSet`, and a rate-based rule (~10 `POST /api/v1/transactions` per minute per IP) attached to CloudFront. About USD 8/month; added only if time and budget allow. | OWASP managed protections and per-IP rate limiting |

## 3. SPA routing on a static host

The build contains only `index.html` and hashed assets; routes such as
`/products/:id` exist only inside React Router. Navigation within the app
never requests HTML from the server (`history.pushState`), but a refresh,
a pasted link or a shared URL does. S3 has no object for
`products/abc123` and a private bucket answers 403.

The viewer-request function rewrites extension-less URIs to `/index.html`
internally (the address bar keeps `/products/abc123`). The browser loads the
SPA, React Router reads the original path and renders the right page;
redux-persist restores the checkout step. Paths with an extension
(`/assets/app-3f9c.js`, `/images/products/x.webp`) pass through untouched.

A distribution-wide custom error response (403/404 → `/index.html` with 200)
is deliberately **not** used: it would also replace real API errors such as
`404 PRODUCT_NOT_FOUND` with HTML.

## 4. Why a VPC and a NAT instance

- RDS lives in an isolated subnet and is never publicly accessible, so the
  Lambdas must run inside the VPC to reach it.
- A Lambda inside a VPC never receives a public IP, so it has no internet
  access on its own — yet it must call the payment gateway, Gmail SMTP, SQS
  and Secrets Manager.
- The NAT (Network Address Translation) instance gives the private subnets
  outbound-only internet through a single public IP; nothing on the internet
  can open a connection inward.
- A NAT instance costs about USD 7/month versus about USD 32/month plus
  traffic for a managed NAT Gateway. Trade-off: it is a single instance — if
  it fails, outbound calls fail while the database keeps working. Production
  would use a NAT Gateway per AZ.

| Option | Security | Cost / month |
|---|---|---|
| Public RDS + Lambda outside the VPC | Port 5432 open to the internet | USD 0 |
| **VPC + NAT instance (chosen)** | Database never public | ~USD 7 |
| VPC + NAT Gateway | Database never public | ~USD 35 |

## 5. Security headers (CloudFront Response Headers Policy + `helmet`)

| Header | Value | Prevents |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Downgrade to plain HTTP |
| `Content-Security-Policy` | `default-src 'self'; connect-src 'self' <gateway sandbox URL>; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | XSS and data exfiltration |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `Referrer-Policy` | `no-referrer` | Leaking `/transactions/:id` URLs to other sites |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Unneeded browser APIs |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-window manipulation |
| `Cache-Control` (API) | `no-store` on personal data | Personal data in shared caches |

`helmet` also removes `X-Powered-By`.

## 6. CDK stacks

- `DataStack`: VPC, NAT instance, RDS, secrets.
- `BackendStack`: four Lambdas, HTTP API, SQS + DLQ, Scheduler, migration trigger, alarms.
- `FrontendStack`: S3, CloudFront (function, headers policy, optional WAF), `BucketDeployment`.
- Deployment: `cdk deploy --all` from a workstation with an AWS profile. CI deployment through GitHub OIDC is a stretch goal.

## 7. Estimated cost (without free tier)

RDS ~USD 12 + storage ~USD 2.5 + NAT instance and public IPv4 ~USD 7 +
Secrets Manager ~USD 0.8 (+ WAF ~USD 8 if enabled). Lambda, API Gateway,
SQS, CloudFront and S3 are ≈ USD 0 at demo traffic. Total ≈ USD 22–30/month;
the stacks are destroyed with `cdk destroy` after the evaluation.
