# Data integrity

Referenced from `CLAUDE.md`. Read when touching money, stock, transaction
states, idempotency, soft deletes or anything that handles customer or card
data.

## Money
- Integer cents everywhere; computed only on the server. The client sends
  `productId`, `quantity` and `municipalityCode`, never amounts.
- `expectedTotalInCents` is only compared against the server's own quote;
  a mismatch returns 409 `PRICE_CHANGED` and nothing is charged.
- Price and fees are snapshotted on the transaction at purchase time.

## Stock
- `stock_available` is what the UI shows; `stock_reserved` is held by
  PENDING transactions.
- Reserve: `available − q`, `reserved + q`, only `WHERE stock_available >= q`.
  Zero affected rows means `OUT_OF_STOCK`.
- APPROVED: `reserved − q`. Any other final status: `available + q`, `reserved − q`.
- Never release stock for a transaction the gateway still reports as PENDING.
- Reservation TTL is 5 minutes and only expires transactions that never
  reached the gateway.

## Idempotency (four layers)
1. `Idempotency-Key` header → unique `transactions.idempotency_key` +
   `request_hash`. Same key and body → replay; same key, different body → 422.
2. The gateway is never called again once `provider_transaction_id` exists.
3. Finalization is a conditional `UPDATE … WHERE status = 'PENDING'`; zero
   affected rows means someone else already finalized it, so do nothing.
   Polling, webhook and reconciler all converge on the same use case.
4. The email worker checks `email_sent_at` before sending; SQS delivers at
   least once.

## Soft deletes
- Every table has `deleted_at`; unique indexes are partial (`WHERE deleted_at IS NULL`).
- `transactions` and `deliveries` are financial records: no endpoint or use
  case ever sets their `deleted_at`.

## Sensitive data
- The card number and CVC never leave the browser's card form; the backend
  receives only the gateway token, brand and last 4 digits.
- Secrets (private key, integrity secret, events secret, SMTP password)
  live in AWS Secrets Manager and are never logged.
- The logger redacts card, token, document number, email and phone fields.
- No endpoint searches customers by email or document number.
- `GET /transactions/:id` never returns the customer's email or document number.
