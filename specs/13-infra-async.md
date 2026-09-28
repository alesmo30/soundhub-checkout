# SPEC 13 — Infra: async queue and scheduler

> **Status:** Approved
> **Depends on:** SPEC 09 (blocking: VPC, `lambdaSecurityGroup`, `app-secrets`, `CheckoutBackendStack` with `apiLambda`), SPEC 12a (blocking: `reconciler.handler.ts`), SPEC 12b (blocking: `email-worker.handler.ts`)
> **Date:** 2026-09-28
> **Objective:** The backend's asynchronous half runs in AWS — SQS delivers finalized transactions to an email worker Lambda, and a reconciler Lambda runs every minute via EventBridge Scheduler, both with DLQ/error alarms wired to an email-subscribed SNS topic.

> Source phase: `phases/sunday/infra/06-async.md`.

## Scope

**In:**

- `transaction-finalized` SQS queue + DLQ (max 5 receives), added to `CheckoutBackendStack`.
- `apiLambda` granted `sqs:SendMessage` on the queue; queue URL in its environment (`TRANSACTION_FINALIZED_QUEUE_URL`).
- Email Worker Lambda (private subnets, `lambdaSecurityGroup`), SQS event source (batch size 5, `reportBatchItemFailures`), read access to `app-secrets` and `db-credentials`.
- Reconciler Lambda (same subnet/SG), triggered by an EventBridge Scheduler `CfnSchedule` at `rate(1 minute)`, with a retry policy.
- CloudWatch alarms (DLQ visible messages > 0, Email Worker errors, Reconciler errors) notifying an SNS topic with an email subscription taken from a `CfnParameter`.
- Explicit `LogGroup` (14-day retention) for both new Lambdas.
- CDK assertion tests for every resource above, in `infra/test/`.

**Out of scope (for future specs):**

- Passing `PUBLIC_WEB_URL` (the CloudFront URL) to the Email Worker Lambda — `CheckoutFrontendStack` synthesizes after `CheckoutBackendStack`, so the URL does not exist yet when this spec's Lambda is created. Emails ship without the "Ver mi pedido" / "Intentar de nuevo" button until a later spec adds a mechanism (e.g. an SSM Parameter written by the frontend stack and read at cold start).
- Any change to `apps/**`. The `email-worker.handler.ts` and `reconciler.handler.ts` entry points, and their `webpack.lambda.config.cjs` bundle entries, belong to SPEC 12b and SPEC 12a respectively — this spec only references the resulting `dist-lambda/email-worker.js` and `dist-lambda/reconciler.js` bundles, the same way `CheckoutBackendStack` already references `dist-lambda/lambda.js` and `dist-lambda/migrator.js`.
- Error alarms on the existing API and Migrator Lambdas (SPEC 09's resources).
- A DLQ redrive consumer. The DLQ is terminal; it is only observed through the alarm.
- WAF and CI deployment (per the phase file).

## Data model

This spec introduces no application data structures. It reuses SPEC 09's `CheckoutDataStack` outputs (`vpc`, `lambdaSecurityGroup`, `dbSecret`, `appSecrets`) and `CheckoutBackendStack`'s existing `apiLambda`, both referenced as local constructs within the same file.

### Files

```
infra/
├─ bin/app.ts                      unchanged
├─ lib/
│  ├─ config/constants.ts          + ASYNC namespace (queue name, timeouts, batch size, retry policy)
│  └─ backend-stack.ts             + async section: queue, DLQ, email worker Lambda + event source,
│                                     reconciler Lambda + CfnSchedule, SNS topic + alarms, CfnParameter
└─ test/
   └─ backend-stack-async.test.ts  new file, same synthXStack() pattern as backend-stack.test.ts
```

### Configuration (`infra/lib/config/constants.ts`)

```ts
export const ASYNC = {
  QUEUE_NAME: 'transaction-finalized',
  DLQ_MAX_RECEIVE_COUNT: 5,
  EMAIL_WORKER: { MEMORY_MB: 512, TIMEOUT: Duration.minutes(2) },
  QUEUE_VISIBILITY_TIMEOUT: Duration.minutes(12),  // 6 × EMAIL_WORKER.TIMEOUT
  SQS_BATCH_SIZE: 5,
  RECONCILER: {
    MEMORY_MB: 512,
    TIMEOUT: Duration.minutes(1),
    SCHEDULE_RATE: 'rate(1 minute)',
    MAX_RETRY_ATTEMPTS: 2,
    MAX_EVENT_AGE_SECONDS: 120,
  },
};
```

## Implementation plan

Prerequisites (not commits):

- SPEC 09 is merged into `main` (`CheckoutDataStack`, `CheckoutBackendStack` with `apiLambda`). `/spec-impl` creates `spec-13-infra-async` from the updated `main`.
- SPEC 12a and SPEC 12b are merged before a real `cdk deploy` of this stack is meaningful (their handler files must exist for `dist-lambda/email-worker.js` / `dist-lambda/reconciler.js` to be produced by `build:lambda`). Steps 1–5 below only need `cdk synth` against the fixture bundle path already used by `infra/test/`, so they do not block on 12a/12b.

Each step is one commit after review. Target: ≤ ~300 changed lines per step. Pushing and opening a PR happen only when the user asks.

1. [x] **Async config constants.** Add the `ASYNC` namespace to `infra/lib/config/constants.ts` (queue name, DLQ max receive count, worker/reconciler memory and timeout, SQS visibility timeout, batch size, reconciler retry policy).

   Manual test: `pnpm --filter @checkout/infra typecheck` passes.
   Commit: `feat(infra): add async section config constants`.

2. [x] **SQS queue, DLQ and API Lambda grant.** In `CheckoutBackendStack`: `TransactionFinalizedDlq`, `TransactionFinalizedQueue` (redrive policy `maxReceiveCount = ASYNC.DLQ_MAX_RECEIVE_COUNT`, visibility timeout `ASYNC.QUEUE_VISIBILITY_TIMEOUT`); `queue.grantSendMessages(apiLambda)`; `apiLambda.addEnvironment('TRANSACTION_FINALIZED_QUEUE_URL', queue.queueUrl)`. The specs cover:
   - the queue and DLQ exist, with the exact redrive `maxReceiveCount`;
   - the queue's visibility timeout is 720 s;
   - `apiLambda`'s IAM policy grants `sqs:SendMessage` scoped to the queue ARN (not `*`);
   - `apiLambda`'s environment includes `TRANSACTION_FINALIZED_QUEUE_URL`.

   Manual test: `pnpm --filter @checkout/infra test` green; `cdk synth` includes the queue.
   Commit: `feat(infra): add transaction-finalized SQS queue and DLQ`.

3. [x] **Email Worker Lambda and SQS event source.** New Lambda (Node 22, arm64, `ASYNC.EMAIL_WORKER.MEMORY_MB`/`TIMEOUT`, private subnets, `lambdaSecurityGroup`, handler `email-worker.handler.handler`, code from the shared `lambdaBundlePath`), its own `LogGroup` (`RetentionDays.TWO_WEEKS`), env vars (`EMAIL_DRIVER=smtp`, `DB_SECRET_ARN`, `APP_SECRETS_ARN`, plus the same non-secret DB/SMTP config already passed to `apiLambda`), `dbSecret.grantRead` and `appSecrets.grantRead`, and an `SqsEventSource(queue, { batchSize: ASYNC.SQS_BATCH_SIZE, reportBatchItemFailures: true })`. The specs cover:
   - runtime, architecture, memory, timeout, subnet and security group;
   - the event source mapping has batch size 5 and partial batch response enabled;
   - the environment holds no raw secret value (same negative-assertion pattern as `backend-stack.test.ts`'s existing check);
   - the IAM grants are scoped to the specific secret ARNs, not `*`.

   Manual test: `cdk synth` succeeds against the test fixture bundle.
   Commit: `feat(infra): add email worker Lambda consuming the SQS queue`.

4. [x] **Reconciler Lambda and EventBridge Scheduler.** New Lambda (same runtime/subnet/SG pattern as step 3, `ASYNC.RECONCILER.MEMORY_MB`/`TIMEOUT`, handler `reconciler.handler.handler`, its own `LogGroup`), an IAM role letting `scheduler.amazonaws.com` invoke it, and a `CfnSchedule` (`ScheduleExpression: ASYNC.RECONCILER.SCHEDULE_RATE`, `FlexibleTimeWindow: { Mode: 'OFF' }`, target the reconciler Lambda's ARN with `RetryPolicy: { MaximumRetryAttempts: ASYNC.RECONCILER.MAX_RETRY_ATTEMPTS, MaximumEventAgeInSeconds: ASYNC.RECONCILER.MAX_EVENT_AGE_SECONDS }`). The specs cover:
   - the reconciler Lambda's runtime/memory/timeout/subnet/SG;
   - the schedule's rate expression, target ARN and retry policy values;
   - the invoke permission is scoped to the scheduler's role, not public.

   Manual test: `cdk synth` shows an `AWS::Scheduler::Schedule` resource.
   Commit: `feat(infra): add reconciler Lambda on a 1-minute EventBridge Scheduler`.

5. [ ] **Alarms and SNS notification.** A `CfnParameter AlarmEmail` (string, no default) inside `CheckoutBackendStack`; an `AsyncAlarmsTopic` SNS topic with an email subscription bound to that parameter; three `Alarm` constructs — `DlqNotEmptyAlarm` (`ApproximateNumberOfMessagesVisible` on the DLQ, threshold > 0), `EmailWorkerErrorsAlarm` and `ReconcilerErrorsAlarm` (`Errors` metric on each Lambda, threshold > 0) — each with `addAlarmAction(new SnsAction(topic))`. The specs cover:
   - the three alarms exist with the correct namespace, metric name, dimensions and threshold;
   - the SNS topic has exactly one email subscription, using the `AlarmEmail` parameter (not a literal address).

   Manual test: `pnpm --filter @checkout/infra test` green; `cdk synth --parameters AlarmEmail=test@example.com` succeeds.
   Commit: `feat(infra): add DLQ and Lambda error alarms with SNS email notification`.

6. [ ] **Close-out.**
   - Full `infra/test` suite, `pnpm --filter @checkout/infra lint` and `pnpm --filter @checkout/infra typecheck` green.
   - Note in the PR description that a real end-to-end check (sandbox payment → email delivered; abandoned PENDING → expired) needs SPEC 09, SPEC 12a and SPEC 12b merged and deployed first — it is checkpoint work, not part of this spec's automated verification.
   - When the user asks, push and open the PR with `gh-cli`, wait for CI, and fix whatever fails.
   - Finally, mark this spec `Implemented`.

   Manual test: every local check green.
   Commit: `docs: mark spec 13 as Implemented`.

Notes:

- A CI fix in step 6 goes in its own `fix: …` commit, after review.
- New dependencies (none expected — everything here uses `aws-cdk-lib`, already a dependency) follow the lockfile protocol if another branch touched `pnpm-lock.yaml`.

## Acceptance criteria

Queue

- [ ] `transaction-finalized` SQS queue exists with a DLQ, redrive `maxReceiveCount = 5`.
- [ ] The queue's visibility timeout is 720 s (6 × the Email Worker's 2-minute timeout).
- [ ] `apiLambda`'s environment includes `TRANSACTION_FINALIZED_QUEUE_URL`, and its IAM policy grants `sqs:SendMessage` scoped to the queue ARN only.

Email Worker Lambda

- [ ] Node 22, arm64, 512 MB, 2-minute timeout, in `lambdaSecurityGroup`'s private subnets.
- [ ] SQS event source with batch size 5 and `ReportBatchItemFailures` enabled.
- [ ] Read access to `db-credentials` and `app-secrets`, both scoped grants (no `*` resource).
- [ ] No raw secret value appears in its environment variables.
- [ ] Its own `LogGroup` with 14-day retention.

Reconciler Lambda

- [ ] Node 22, arm64, 512 MB, 1-minute timeout, same subnet and security group as the Email Worker.
- [ ] An `AWS::Scheduler::Schedule` at `rate(1 minute)` targets it, with `MaximumRetryAttempts: 2` and `MaximumEventAgeInSeconds: 120`.
- [ ] Its own `LogGroup` with 14-day retention.

Alarms

- [ ] An alarm fires when the DLQ has visible messages > 0.
- [ ] An alarm fires on Email Worker Lambda errors, and another on Reconciler Lambda errors.
- [ ] All three alarms notify an SNS topic subscribed to the email address supplied through the `AlarmEmail` `CfnParameter` (not a hardcoded address).

Quality

- [ ] `pnpm --filter @checkout/infra test`, `lint` and `typecheck` exit 0.
- [ ] `cdk synth --parameters AlarmEmail=<any address>` succeeds against the test fixture bundle.

## Decisions

Spec and dependencies

- **Yes:** this is SPEC 13, the infra counterpart of `phases/sunday/infra/06-async.md`. Numbered 13 because 12a and 12b already claim the "12" pair for the `api/06-async.md` phase, and this is a separate phase file.
- **Yes:** the clarification ran question by question; the sections after the header were written in one pass at the user's request, given a tight delivery window.

`PUBLIC_WEB_URL`

- **Yes:** left out of this spec. `CheckoutFrontendStack` (with the CloudFront URL) synthesizes after `CheckoutBackendStack` in `infra/bin/app.ts`, so the URL does not exist yet when the Email Worker Lambda is created here. Result emails ship without the order/retry button until a future spec adds a mechanism.
- **No:** an SSM Parameter written by the frontend stack and read at cold start by the worker. Solves the ordering problem but adds a new runtime dependency and test surface that no phase (09, 12a, 12b) asked for, for a spec meant to take ~1h.
- **No:** reordering `infra/bin/app.ts` to synthesize the frontend stack first. Would touch `frontend-stack.ts`/`app.ts`, outside this spec's `Owns: infra/lib/backend-stack.ts` and risking conflicts with the still-unmerged SPEC 09 branch.

Timeouts and visibility

- **Yes:** Email Worker timeout = 2 min. A batch of 5 records at 10 s SMTP timeout each is ≈ 50 s worst case, plus margin.
- **Yes:** SQS visibility timeout = 12 min (6 × 2 min), per phase R1.
- **Yes:** Reconciler timeout = 1 min, matching its own 1-minute schedule and SPEC 12a's internal 30 s time budget, with margin.

EventBridge Scheduler construct

- **Yes:** `CfnSchedule` (the stable L1 construct). No dependency on an alpha package (`@aws-cdk/aws-scheduler-alpha`), whose API can change between CDK versions.
- **No:** the alpha L2 `Schedule` construct. Nicer API, but alpha packages are not appropriate for infra meant to stay stable across CDK upgrades.

Reconciler retry policy

- **Yes:** 2 retry attempts, 120 s max event age. The reconciler already re-runs every minute, so a long retry window is not worth the added complexity.

Alarm scope

- **Yes:** only the two new Lambdas (Email Worker, Reconciler) get error alarms in this spec. `Owns` is limited to the async section; API and Migrator Lambda alarms, if wanted, belong to SPEC 09 or a follow-up.

Alarm email delivery

- **Yes:** a `CfnParameter AlarmEmail`, declared inside `CheckoutBackendStack`, supplied via `cdk deploy --parameters AlarmEmail=...`. No hardcoded address in the repo, no new `.env` variable for infra.
- **No:** an environment variable read in `infra/bin/app.ts`. Works, but the phase's R4 wording ("SNS topic with an email subscription parameter") already points at a CDK parameter.

Bundling and ownership boundary

- **Yes:** the `webpack.lambda.config.cjs` entries for `email-worker` and `reconciler`, and the handler files themselves, are added by SPEC 12b and SPEC 12a respectively, inside `apps/api/**`. This spec only references the resulting `dist-lambda/*.js` bundles, exactly like the existing `apiLambda`/`migratorLambda` constructs do — keeping this spec inside `Owns: infra/lib/backend-stack.ts` and `Must not touch: apps/**`.

Sizing

- **Yes:** 512 MB for both new Lambdas, matching the existing Migrator Lambda. Both are I/O-bound (SMTP, Postgres), not compute-heavy.

## Risks

| Risk | Mitigation |
| --- | --- |
| `dist-lambda/email-worker.js` and `dist-lambda/reconciler.js` do not exist until SPEC 12b/12a are merged and built. | Steps 1–5 synth against the existing test fixture bundle path, the same pattern `backend-stack.test.ts` already uses for `apiLambda`. A real `cdk deploy` of this stack waits for those specs, as stated in the plan's close-out step. |
| `CfnSchedule` (L1) needs its IAM role and permissions wired by hand, more verbose than the alpha L2 construct. | Accepted trade-off for stability (see Decisions). The CDK assertion tests cover the role and retry policy explicitly. |
| Result emails ship with no "Ver mi pedido" / "Intentar de nuevo" button until `PUBLIC_WEB_URL` is wired in a future spec. | Accepted trade-off (see Decisions). The email is otherwise complete — status, amounts, card, delivery. |
| A wrong DLQ visibility timeout could make SQS re-deliver a message while the Email Worker Lambda is still processing it, causing a duplicate send. | The 720 s (6×) value is fixed by the `ASYNC` constant and asserted by a CDK test, not left to a per-resource literal. |

## What is **not** in this spec

- Passing `PUBLIC_WEB_URL` to the Email Worker Lambda (future spec).
- Any change to `apps/**`, including the webpack bundle entries for the new handlers (SPEC 12a, SPEC 12b).
- Error alarms on the existing API and Migrator Lambdas.
- A DLQ redrive consumer.
- WAF and CI deployment.

Each of these, if it lands, goes in its own spec.
