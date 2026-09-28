# SPEC 12b — API: transaction result emails

> **Status:** Approved
> **Depends on:** SPEC 12a (blocking: conditional `markEmailSent`, re-publish task), SPEC 10 (blocking: `transaction.finalized` event and the `EventPublisher` binding), SPEC 09 (blocking only for the email worker Lambda step: `@types/aws-lambda`, `load-secrets.ts`, `build:lambda`).
> **Date:** 2026-09-27
> **Objective:** Every finalized transaction produces exactly one result email in the customer's inbox — published to SQS, sent by a batch worker through Gmail SMTP with a check-send-mark flow on `email_sent_at`, and rendered from five branded, PII-safe templates — without the payment path ever waiting for email.

> Source phase: `phases/sunday/api/06-async.md` (Part 2). Part 1 is SPEC 12a, which goes first.

## Scope

**In:**

Configuration and adapter selection

- New environment variables, validated at boot:
  - `EVENT_PUBLISHER_DRIVER` (`memory` | `sqs`, default `memory`);
  - `TRANSACTION_FINALIZED_QUEUE_URL` (required when the driver is `sqs`);
  - `EMAIL_DRIVER` (`log` | `smtp`, default `log`);
  - `PUBLIC_WEB_URL` (optional).
- `MessagingModule` (`shared/infrastructure/messaging/`) binds `EVENT_PUBLISHER` by driver: SPEC 10's `InMemoryEventPublisher` or the new `SqsEventPublisher`. `TransactionsModule` swaps its own binding line for an import of this module. That is the only edit to `modules/transactions` (see Decisions).
- `NotificationsModule` binds `EMAIL_SENDER` by driver: `LoggingEmailSender` or `NodemailerGmailAdapter`.
- `.env.example` documents the four variables, with the safe defaults.

Publisher

- `SqsEventPublisher` implements `EventPublisher`: `SendMessage` with the JSON-serialized event as the body, to `TRANSACTION_FINALIZED_QUEUE_URL`. Any SDK error → `Err({ message })`. SPEC 10 already logs and swallows it.

Email use case

- `SendTransactionEmailUseCase.execute(transactionId)` runs **check → send → mark**:
  1. load the transaction. Not found, or still PENDING → `SKIPPED` (logged `error` / `warn`);
  2. `email_sent_at` is set → `ALREADY_SENT`;
  3. load the customer and the product. A missing one → `Err` (a message failure, loud by design);
  4. render the template for the **stored** status;
  5. `EmailSender.send`. `Err` → `Err`, nothing marked;
  6. `markEmailSent` (conditional, SPEC 12a) in a unit of work → `SENT`.

Templates (`modules/notifications/templates/`)

- Five templates: APPROVED, DECLINED, ERROR, VOIDED and EXPIRED. Each has a subject, an HTML body (600 px table, inline styles, `DESIGN.md` tokens) and a plain-text body.
- The content:
  - status chip (icon + text, never color alone);
  - reference in monospace;
  - product × quantity;
  - subtotal, base fee, delivery fee and total in `es-CO` COP format;
  - `BRAND •••• last4`;
  - delivery status label;
  - greeting with the customer's first name.
- **Never** the national ID, email, phone or delivery address.
- With `PUBLIC_WEB_URL`: APPROVED gets "Ver mi pedido" (`/transactions/:id`), and the failed statuses get "Intentar de nuevo" (`/products/:productId`). Without it, there is no button.
- Every variable value goes through `escapeHtml`.

Adapters

- `NodemailerGmailAdapter`: SMTP 465, `secure: true`, credentials from `AppConfig.smtp`, no pool, 10 s connection and send timeouts, `from = EMAIL_FROM`. It never logs credentials, recipients or bodies.
- `LoggingEmailSender`: logs the subject and the text body with the recipient masked (`a***@mail.com`), and returns `Ok`.

Worker

- `email-worker.handler.ts` (Lambda, SQS event source):
  1. `loadSecretsIntoEnv()` (SPEC 09), then an application context cached per container;
  2. process the batch's records **one by one**;
  3. return `{ batchItemFailures: [{ itemIdentifier: messageId }] }` for failed records only.
- A malformed body is logged at `error` and **not** reported: a retry cannot fix it, and the reconciler re-publishes if the transaction really lacks its email.

Local commands

- `email:preview` (`tsx`): renders the 5 templates from fixed sample data into `docs/evidence/emails/<status>.html`.
- `email:send-once <transactionId>` (`nest start --entryFile`): runs the use case once with the current `.env` driver. It is the manual path to a real Gmail inbox.

**Out of scope (for future specs):**

- AWS resources: the queue, the DLQ, the worker Lambda and its event source, alarms, and the Lambda environment values (infra 06).
- Anything in `modules/transactions` beyond swapping the `EVENT_PUBLISHER` binding line for the `MessagingModule` import.
- A FIFO queue or SQS deduplication.
- Classifying SMTP errors as permanent, and a "gave up" state or column.
- Bounce handling, marketing emails, attachments, manual resend, or another email provider or domain.
- Email for PENDING (there is none), and changing SPEC 11's copy.
- Any change to `packages/shared`, frozen ports, ORM entities, migrations, `docs/design/`, `references/`, `phases/` or the `CLAUDE.md` files.

## Data model

No tables, columns or migrations. It reuses `transactions.email_sent_at`, SPEC 12a's conditional `markEmailSent`, the `TransactionFinalizedEvent` type and the frozen `EmailSender` / `EventPublisher` ports.

### Files

```
apps/api/
├─ package.json                         + nodemailer, @aws-sdk/client-sqs · dev @types/nodemailer
│                                       + scripts email:preview, email:send-once
├─ jest.config.ts                       + coverage exclusions: email-worker.handler.ts, email-send-once.cli.ts, email-preview.ts
└─ src/
   ├─ config/
   │  environment-variables.ts          + EVENT_PUBLISHER_DRIVER, TRANSACTION_FINALIZED_QUEUE_URL, EMAIL_DRIVER, PUBLIC_WEB_URL
   │  app-config.ts                     + messaging { driver, queueUrl }, email { driver }, web { publicUrl }
   ├─ shared/infrastructure/messaging/
   │  messaging.module.ts               EVENT_PUBLISHER factory by driver
   │  sqs-event-publisher.ts (+ .spec.ts)
   ├─ modules/transactions/transactions.module.ts   ~ EVENT_PUBLISHER line → imports: [MessagingModule]
   ├─ modules/notifications/
   │  ├─ notifications.module.ts        imports Transactions, Customers, Catalog, Deliveries · EMAIL_SENDER factory · use case
   │  ├─ index.ts                       + SendTransactionEmailUseCase
   │  ├─ domain/notifications.constants.ts
   │  ├─ application/use-cases/send-transaction-email.use-case.ts
   │  ├─ templates/
   │  │  layout.ts · approved.ts · declined.ts · error.ts · voided.ts · expired.ts
   │  │  render-transaction-email.ts · escape-html.ts · format-cop.ts · mask-email.ts
   │  │  __fixtures__/sample-email-data.ts
   │  └─ infrastructure/
   │     nodemailer-gmail.adapter.ts · logging-email-sender.ts
   └─ workers/
      email-worker.handler.ts           Lambda entry (coverage-excluded bootstrap)
      email-worker.ts                   processBatch(records, useCase) → SQSBatchResponse  (tested)
      email-send-once.cli.ts            (coverage-excluded bootstrap)
      email-preview.ts                  (coverage-excluded script)
```

`email-worker.ts` holds the batch logic so it can be unit-tested. The handler only bootstraps and delegates, like SPEC 09's `lambda.ts`.

### Configuration

```ts
// environment-variables.ts (class-validator, like the existing fields)
EVENT_PUBLISHER_DRIVER?: 'memory' | 'sqs';           // default 'memory'
TRANSACTION_FINALIZED_QUEUE_URL?: string;            // @ValidateIf(driver === 'sqs') @IsUrl
EMAIL_DRIVER?: 'log' | 'smtp';                       // default 'log'
PUBLIC_WEB_URL?: string;                             // @IsUrl({ require_tld: false }) — allows http://localhost:5173

// app-config.ts
messaging: { driver: 'memory' | 'sqs'; queueUrl: string | null };
email: { driver: 'log' | 'smtp' };
web: { publicUrl: string | null };                   // trailing slash trimmed
```

| Where | `EVENT_PUBLISHER_DRIVER` | `EMAIL_DRIVER` |
|---|---|---|
| Laptop, default `.env` | memory | log |
| Tests | memory (or fakes) | log (or fakes) |
| AWS Lambdas (set by infra 06) | sqs | smtp |
| Laptop, real Gmail check | memory | smtp |

### Use case

```ts
type SendEmailOutcome = 'SENT' | 'ALREADY_SENT' | 'SKIPPED';

SendTransactionEmailUseCase.execute(transactionId: string): ResultAsync<SendEmailOutcome, EmailSendError>
//   check: transactions.findById → null → SKIPPED (error log) · PENDING → SKIPPED (warn) · emailSentAt → ALREADY_SENT
//   load:  customers.findById, products.findById, deliveries.findByTransactionId → any null → Err (message fails)
//   send:  renderTransactionEmail(…) → emailSender.send({ to: customer.email, … }) → Err → Err (not marked)
//   mark:  unitOfWork.run(tx => transactions.markEmailSent(tx, id)) → SENT
```

### Templates

```ts
interface TransactionEmailData {
  status: FinalStatus;                       // APPROVED | DECLINED | ERROR | VOIDED | EXPIRED
  firstName: string;                         // first word of customer.fullName
  reference: string;
  productName: string; quantity: number;
  amounts: { subtotalInCents: number; baseFeeInCents: number; deliveryFeeInCents: number; totalInCents: number };
  card: { brand: CardBrand; last4: string };
  deliveryStatus: DeliveryStatus;
  links: { orderUrl: string; retryUrl: string } | null;   // null when PUBLIC_WEB_URL is absent
}

renderTransactionEmail(data: TransactionEmailData): { subject: string; html: string; text: string };
```

| Status | Subject | Chip (bg / text) | Lead line | Button |
|---|---|---|---|---|
| APPROVED | ¡Tu pago fue aprobado! · {reference} | `brand-mint` / `ink` "Aprobado" | "Hola, {firstName}. Recibimos tu pago y tu pedido ya está listo para envío." | Ver mi pedido |
| DECLINED | Tu pago fue rechazado · {reference} | `danger` / white "Rechazado" | "Hola, {firstName}. Tu banco rechazó el pago. No se hizo ningún cobro." | Intentar de nuevo |
| ERROR | No pudimos procesar tu pago · {reference} | `danger` / white "Error" | "Hola, {firstName}. Hubo un problema al procesar tu pago. No se hizo ningún cobro." | Intentar de nuevo |
| VOIDED | Tu pago fue anulado · {reference} | `danger` / white "Anulado" | "Hola, {firstName}. El pago fue anulado y no se hizo ningún cobro." | Intentar de nuevo |
| EXPIRED | Tu pago no se completó · {reference} | `warning` / `ink` "No completado" | "Hola, {firstName}. Tu pago no se completó y no se hizo ningún cobro." | Intentar de nuevo |

Layout: an `ink` (`#2C2A29`) header with "SoundHub" in `brand-lime` (`#DFFF61`), a `surface` body, the amounts table with `border-subtle` dividers, the total bold, and a footer "Pago seguro · Correo automático, no respondas a este mensaje." Delivery labels: `READY_TO_SHIP` "Listo para envío", `CANCELLED` "Cancelado", `AWAITING_PAYMENT` "Esperando pago". Money: `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })` over cents / 100, the same formatter the web uses.

### Worker

```ts
// workers/email-worker.ts
processBatch(event: SQSEvent, useCase: SendTransactionEmailUseCase): Promise<SQSBatchResponse>
//   for (const record of event.Records)   — sequential, never Promise.all
//     body not a TransactionFinalizedEvent (JSON.parse fails / no transactionId) → error log, not reported
//     useCase.execute(id): Ok(any outcome) → not reported · Err → { itemIdentifier: record.messageId }
```

## Implementation plan

Prerequisites (not commits):

- SPEC 10 and SPEC 12a are merged into `main`. `/spec-impl` then creates `spec-12b-api-email-notifications` from the updated `main`.
- `TransactionsModule` exports `TRANSACTION_REPOSITORY`. If SPEC 08 did not export it, step 3 adds that one line and records it.
- SPEC 09 is merged before step 8 (the Lambda handler). Steps 1–7 do not need it.
- For step 9's manual check: a Gmail account with an app password in `.env` (`SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`), set by the user in their own terminal.

Each step is one commit after review. Target: ≤ ~300 changed lines per step. Pushing and opening PRs happen only when the user asks.

### Configuration and publisher

1. [x] **Drivers in config.** The four variables in `environment-variables.ts` and `app-config.ts`, and `.env.example`. The specs cover:
   - the defaults are `memory` / `log` / `null`;
   - `sqs` without a queue URL fails validation, naming the variable;
   - an invalid driver value fails;
   - `PUBLIC_WEB_URL=http://localhost:5173` is accepted and its trailing slash is trimmed.

   Manual test: `pnpm dev` boots with the default `.env`.
   Commit: `feat(api): add messaging and email driver configuration`.

2. [x] **SQS publisher and messaging module.** Add `@aws-sdk/client-sqs`. `SqsEventPublisher` and `MessagingModule` (a factory by driver), and `TransactionsModule` importing it instead of binding `EVENT_PUBLISHER` itself. The specs, with a mocked `SQSClient.send`, cover:
   - the body is the event JSON, sent to the configured URL;
   - an SDK rejection → `Err` with a message that has no body;
   - the module resolves `InMemoryEventPublisher` for `memory` and `SqsEventPublisher` for `sqs`.

   Manual test: `test` green; `pnpm dev` still logs "event published" after a local finalize.
   Commit: `feat(api): publish transaction events to SQS when configured`.

### Templates

3. [x] **Templates and preview.** `templates/**`, `domain/notifications.constants.ts`, the sample fixture, and `email-preview.ts` with its script. The specs cover:
   - each status's subject, chip label and lead line;
   - COP formatting (`392046000` → "$ 3.920.460") in both HTML and text;
   - `•••• 4242`;
   - `escapeHtml` on a product name with `<script>` and `&`;
   - buttons present with links and absent without;
   - no national ID, email, phone or address anywhere in HTML or text (sample data carries them, and the specs assert their absence);
   - the text body carries the same facts as the HTML.

   Manual test: `pnpm --filter @checkout/api email:preview`, then open the 5 files in Chrome at 375×667 and 1440×900 and save the screenshots to `docs/evidence/emails/`.
   Commit: `feat(api): add transaction result email templates`.

### Senders and use case

4. [x] **Email senders.** Add `nodemailer` and `@types/nodemailer`. `NodemailerGmailAdapter` and `LoggingEmailSender`, and `NotificationsModule` binding `EMAIL_SENDER` by driver. The specs cover:
   - the Nodemailer transport options (465, `secure`, the timeouts, `auth` from config), with `createTransport` mocked;
   - `sendMail` receives `from`, `to`, `subject`, `html` and `text`;
   - a rejection → `Err` with a message that holds no credentials;
   - the logging sender masks the recipient;
   - a captured-logger assertion that neither adapter logs the password or the full recipient;
   - the module picks the adapter by driver.

   Manual test: `test` green.
   Commit: `feat(api): add Gmail SMTP and logging email senders`.

5. [x] **Send transaction email use case.** `SendTransactionEmailUseCase` over fake ports and a fake `UnitOfWork`. The specs cover:
   - not found → `SKIPPED`, PENDING → `SKIPPED`, `emailSentAt` set → `ALREADY_SENT`, all without sending;
   - APPROVED → one send to `customer.email`, then `markEmailSent` inside `run` → `SENT`;
   - the template is chosen by the **stored** status;
   - a send `Err` → `Err`, and `markEmailSent` is never called;
   - a missing customer, product or delivery → `Err`, with no send;
   - a second `execute` after a `SENT` → `ALREADY_SENT` (same message twice, one email).

   Manual test: `test` green.
   Commit: `feat(api): send one result email per finalized transaction`.

6. [x] **Use case against Postgres.** `send-transaction-email.int-spec.ts` runs the real use case, repositories and `TypeOrmUnitOfWork`, with a capturing fake `EmailSender`. The setup finalizes a transaction through SPEC 10's finalizer. It proves:
   - one execute → 1 captured email and `email_sent_at` set;
   - a second execute → still 1 email;
   - with a failing sender → 0 emails, `email_sent_at` still null, and a later execute with a working sender sends it.

   Test products are soft-deleted in a `finally`.
   Manual test: `test:int` green.
   Commit: `test(api): prove result emails are sent once against Postgres`.

### Worker

7. [ ] **Batch processing.** `workers/email-worker.ts` (`processBatch`). The specs, with a fake use case, cover:
   - a batch of 5 where the 3rd returns `Err` → `batchItemFailures` holds exactly that `messageId`;
   - records are processed sequentially (call-order assertion with delayed fakes);
   - a malformed body → error log, not reported, and the rest processed;
   - `SKIPPED` / `ALREADY_SENT` are not reported;
   - an empty batch → `{ batchItemFailures: [] }`.

   Manual test: `test` green.
   Commit: `feat(api): process result-email batches with partial failures`.

8. [ ] **Email worker Lambda handler and local send.** Requires SPEC 09 on `main`.
   - `workers/email-worker.handler.ts`: `loadSecretsIntoEnv()`, an application context cached in a module-level promise, then `processBatch`. Add it to `build:lambda` and the coverage exclusions.
   - `workers/email-send-once.cli.ts` with the `email:send-once` script (`nest start --entryFile`).

   Manual test: `build:lambda`, then invoke the handler with a sample `SQSEvent` holding one valid and one malformed record against docker Postgres (`EMAIL_DRIVER=log`). Expect one masked log email and `batchItemFailures: []`.
   Commit: `feat(api): add the email worker Lambda handler and a local send command`.

### Close-out

9. [ ] **Real inbox check, coverage and CI.**
    - With `EMAIL_DRIVER=smtp` and a real app password, run `email:send-once <id>` for an APPROVED and a DECLINED transaction whose customer email is the user's own. Both arrive, and a second run sends nothing.
    - Screenshots of both received emails (Gmail web and mobile) go to `docs/evidence/emails/`.
    - `test:cov`: `modules/notifications` ≥ 85 % and `sqs-event-publisher.ts` ≥ 85 % on all four metrics. `apps/api` stays ≥ 80 %.
    - When the user asks, push and open the PR with `gh-cli`, wait for CI, and fix whatever fails.
    - Finally, mark this spec `Implemented`.

    Manual test: every check green.
    Commit: `docs: mark spec 12b as Implemented`.

Notes:

- A CI fix in step 9 goes in its own `fix: …` commit, after review.
- New dependencies follow the lockfile protocol if another branch touched `pnpm-lock.yaml`.
- Checkpoint C3 (a real sandbox payment on the deployed app delivering the email) runs after infra 06. It is not part of this spec.

## Acceptance criteria

Configuration

- [ ] With the default `.env`, the app boots with `InMemoryEventPublisher` and `LoggingEmailSender`, and never contacts SQS or SMTP.
- [ ] `EVENT_PUBLISHER_DRIVER=sqs` without `TRANSACTION_FINALIZED_QUEUE_URL` fails at boot with a message naming the variable.
- [ ] `EMAIL_DRIVER=smtp` selects `NodemailerGmailAdapter` on port 465 with `secure: true`.

Publishing and idempotency

- [ ] With the `sqs` driver, a finalization sends one SQS message whose body is the `transaction.finalized` event JSON.
- [ ] Delivering the same message twice sends one email (unit and int-spec).
- [ ] A send failure leaves `email_sent_at` null, and a later delivery sends the email.
- [ ] A batch of 5 with one failing record reports only that record's `messageId` in `batchItemFailures`.
- [ ] A malformed record is logged and not reported, and the other records are processed.
- [ ] Records within a batch are processed sequentially.

Templates

- [ ] Each of APPROVED, DECLINED, ERROR, VOIDED and EXPIRED renders its subject, chip, lead line, reference, product × quantity, the four amounts in COP format, `BRAND •••• last4` and the delivery status label, in both HTML and text.
- [ ] No template output contains the customer's national ID, email, phone or delivery address.
- [ ] Variable values are HTML-escaped.
- [ ] With `PUBLIC_WEB_URL`, APPROVED links to `/transactions/:id` and the failed statuses link to `/products/:productId`. Without it, there is no button.
- [ ] `docs/evidence/emails/` holds the 5 previews at 375×667 and 1440×900, and the two real received emails.

Security and logging

- [ ] No log line contains the SMTP password, a full recipient address, or an email body sent through SMTP.
- [ ] The logging sender masks the recipient.

Architecture

- [ ] `modules/transactions` changed only by replacing its `EVENT_PUBLISHER` binding with the `MessagingModule` import (and, if needed, exporting `TRANSACTION_REPOSITORY`).
- [ ] The only new dependencies are `nodemailer`, `@aws-sdk/client-sqs` and `@types/nodemailer`.
- [ ] `email-worker.handler.ts`, `email-send-once.cli.ts` and `email-preview.ts` are the only new coverage exclusions.

Quality and CI

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @checkout/api test:cov` and `test:int` exit 0 locally.
- [ ] `modules/notifications` ≥ 85 % on statements, branches, functions and lines, and `apps/api` ≥ 80 %.
- [ ] A real Gmail inbox receives the APPROVED and DECLINED emails, and a second `email:send-once` sends nothing.
- [ ] The PR shows green `lint`, `typecheck`, `coverage (api)` and `api-integration`.

## Decisions

Spec and dependencies

- **Yes:** this is SPEC 12b, the second half of `phases/sunday/api/06-async.md`. It goes after SPEC 12a, which implements `markEmailSent` and the re-publish task in `modules/transactions`.
- **Yes:** the Lambda handler step waits for SPEC 09. Everything before it runs locally.
- **Yes:** the clarification ran question by question, and the sections after the header were written in one pass at the user's request.

Idempotency

- **Yes:** check → send → mark, with a conditional mark. If Gmail fails, nothing is marked and the next copy (an SQS retry, or SPEC 12a's re-publish every 5 min) tries again. An email is never lost.
- **Yes, accepted trade-off:** two copies processed at the exact same instant, or a crash between send and mark, can produce 2 emails. Between "sometimes 2" and "sometimes 0", a duplicate is the lesser harm for a payment notice. Sequential processing within a batch and SPEC 12a's 5-minute re-publish lease keep the window small.
- **No:** claim first (mark → send). A failed send after the mark would leave Ana without her email, and the re-publish task would no longer see her. It also needs a frozen-port change to report the claim and an "unmark" method.
- **No:** a FIFO queue with deduplication. It is an infra change, its 5-minute dedup window misses the re-publishes, and it adds cost.
- **Yes:** every send failure is retryable. Gmail accepts mail for non-existent recipients and bounces it later. The failures seen at send time are configuration or network ones, which are fixed and retried, not permanent per-recipient ones.
- **Yes:** a malformed body, an unknown transaction or a still-PENDING one is logged and not reported. A retry cannot fix it.
- **Yes:** a missing customer, product or delivery fails the message, and it reaches the DLQ and its alarm. It is loud by design, like SPEC 10's view inconsistencies.

Configuration

- **Yes:** explicit drivers, `EVENT_PUBLISHER_DRIVER=memory|sqs` and `EMAIL_DRIVER=log|smtp`, with safe defaults. The default `.env` never sends a real email, and Gmail can be tried locally by changing one line.
- **No:** deriving adapters from `NODE_ENV`. It mixes "which environment" with "which adapter", and testing Gmail locally would need `production` mode.
- **No:** selecting by presence (queue URL set, or a real-looking SMTP password). A real password in `.env` for another test would silently start sending real emails.
- **Yes (deviation from the phase's "must not touch Transactions module"):** the `EVENT_PUBLISHER` binding moves from `TransactionsModule` to a shared `MessagingModule` that it imports. The phase gives this spec "the adapter selection by config", but SPEC 10 put the binding in `TransactionsModule`. A two-line swap is smaller and clearer than duplicating the selection there.

Templates

- **Yes:** TypeScript template-literal functions, 600 px tables with inline styles, `DESIGN.md` tokens, and `escapeHtml` on every variable value. There are no dependencies, and the output is asserted by unit tests.
- **No:** MJML. It is a ~5 MB dependency in every Lambda bundle and another syntax for five single-column emails.
- **No:** React Email. It brings React and JSX into the backend build for five templates.
- **Yes:** an `email:preview` script plus Chrome screenshots at both widths, and screenshots of two real received emails. It extends the project's visual-evidence rule to emails.
- **Yes (deviation from FR-23's list, decided in SPEC 12a):** five templates, EXPIRED included. SPEC 11's screen promises "Te avisaremos por correo".
- **Yes:** the template follows the stored status, not the event's. The database is the source of truth.
- **Yes:** only the first name, never the national ID, email, phone or address (phase R4 and `references/data-integrity.md`).

Links

- **Yes:** an optional `PUBLIC_WEB_URL`. With it, APPROVED shows "Ver mi pedido" and the failed statuses show "Intentar de nuevo". Without it, there is no button. Infra 06 passes the CloudFront URL that SPEC 09 records after its first deploy, so the stacks have no cycle.
- **No:** self-contained emails with no links. Luis, declined, would have to find the store on his own to retry.

Adapters and commands

- **Yes:** Nodemailer without a pool (short Lambda invocations), with 10 s timeouts so a hung SMTP cannot eat the worker's time.
- **Yes:** `email:preview` runs with `tsx` (pure functions), and `email:send-once` with `nest start --entryFile`, because `tsx` emits no decorator metadata (the same finding as SPEC 12a's `reconcile:once`).

## Risks

| Risk | Mitigation |
| --- | --- |
| Gmail blocks the login (no app password, 2FA off) or rate-limits the account (~500 emails/day for personal accounts). | Step 9 uses an app password, set by the user in their own terminal. The challenge volume is far below the limit. Failures are retryable and the DLQ alarm makes them visible. |
| Emails land in spam (a personal Gmail sender with HTML). | A plain-text part, no external images, a consistent `from`, and a footer that says it is automatic. A custom domain with SPF/DKIM is out of scope. |
| Email clients render the HTML differently (Outlook, dark mode). | Tables with inline styles only, and the status is always text + icon, never color alone. It is checked in Gmail web and mobile in step 9. |
| A duplicate email in the rare concurrent-delivery window. | Accepted trade-off (see Decisions). It is kept small by sequential batches and the 5-minute re-publish lease. |
| `TRANSACTION_REPOSITORY` is not exported by `TransactionsModule` after SPEC 08. | Checked as a prerequisite. A one-line export is added in step 3 and recorded. |
| The worker's timeout (set by infra 06) is shorter than 5 × a slow SMTP send. | The 10 s SMTP timeouts cap one record at ~20 s. infra 06 must set the worker timeout ≥ 2 min, and the visibility timeout at 6 × that. This is noted for infra 06. |
| New dependencies conflict in `pnpm-lock.yaml` with a parallel branch. | The lockfile protocol applies. The dependencies are added in the steps that use them (2 and 4). |

## What is **not** in this spec

- The AWS queue, DLQ, worker Lambda, event source, alarms and Lambda environment values (infra 06).
- Any other change to `modules/transactions`.
- A FIFO queue, a "gave up" state, bounce handling or SMTP error classification.
- Marketing emails, attachments, manual resend, or another provider or domain.
- Changes to `packages/shared`, frozen ports, ORM entities, migrations, `docs/design/`, `references/`, `phases/` or the `CLAUDE.md` files.

Each of these, if it lands, goes in its own spec.
