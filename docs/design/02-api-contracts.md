# Design 02 — API Contracts

## 1. Conventions

| Topic | Decision |
|---|---|
| Base URL | `https://<cloudfront-domain>/api/v1`, same origin as the SPA (no CORS). |
| Format | JSON in camelCase. Dates in ISO-8601 UTC. IDs are uuid v4; a non-uuid id returns 400. |
| Money | Always integer cents with the `InCents` suffix plus `currency: "COP"`. Never decimals. Calculations round to the whole peso. |
| Success | Envelope `{ "data": … }`. Collections add `"meta"` with pagination. |
| Errors | RFC 9457 Problem Details (`application/problem+json`): `{ type, title, status, code, detail, traceId, errors? }`. |
| Tracing | `X-Request-Id` header: propagated if present, generated otherwise. Always returned and echoed as `traceId`. |
| Idempotency | `Idempotency-Key` header (uuid v4), mandatory on `POST /transactions`. |
| Caching | Location catalogs: `public, max-age=86400`. Products: `public, max-age=10`. Transactions, customers and deliveries: `no-store`. |
| Rate limiting | Global throttling in API Gateway. `POST /transactions`: 10/min per IP. `POST /customers`: 20/min per IP. Exceeded → 429 with `Retry-After`. |
| Documentation | Swagger UI at `/api/docs` (generated from the DTOs) and a Postman collection in the repository. |

### Error format
```json
{
  "type": "https://errors.checkout.dev/out-of-stock",
  "title": "Out of stock",
  "status": 409,
  "code": "OUT_OF_STOCK",
  "detail": "Only 1 unit available",
  "traceId": "7f3c…",
  "errors": [ { "field": "quantity", "message": "must not be greater than 1" } ]
}
```
`errors` is only present on validation errors (400).

## 2. Input validation

- A global `ValidationPipe` is configured in `main.ts`:
  ```ts
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,              // strips properties without validation decorators
    forbidNonWhitelisted: true,   // …and rejects the request (400) if any were sent
    transform: true,              // turns the plain payload into the DTO class instance
    stopAtFirstError: false,      // reports every invalid field at once
  }));
  ```
- `whitelist` alone would silently drop unknown fields. `forbidNonWhitelisted` turns them into a 400, which makes mass-assignment attempts (e.g. sending `status` or `totalInCents`) visible instead of ignored.
- Nested objects (`payment`, `delivery`) use `@ValidateNested()` + `@Type(() => PaymentDto)`; without them the whitelist is not applied recursively.
- Query parameters use explicit `@Type(() => Number)` instead of implicit conversion.
- DTOs live in the HTTP adapter and are mapped to use-case commands. The domain never sees a DTO.
- Validation limits and patterns (max quantity, installments range, phone and national ID regex) live in `packages/shared`. The backend's class-validator decorators and the frontend's Zod schemas (used by react-hook-form) are both built from those constants, so both sides enforce identical rules.
- Zod is used only on the frontend. The backend keeps class-validator because it integrates natively with Nest's `ValidationPipe` and with the Swagger CLI plugin.
- The `@nestjs/swagger` CLI plugin reads the same DTO classes, so the Swagger document never drifts from the validation rules.

## 3. Endpoints

### GET /products?page=1&limit=10
- Query: `page` ≥ 1 (default 1), `limit` 1–50 (default 10).
- 200:
```json
{ "data": [ { "id": "…", "sku": "HP-SNY-WH1000XM5", "name": "WH-1000XM5", "brand": "Sony",
              "priceInCents": 189990000, "currency": "COP",
              "imageUrl": "https://…/wh1000xm5-640.webp", "stockAvailable": 7 } ],
  "meta": { "page": 1, "limit": 10, "totalItems": 15, "totalPages": 2 } }
```
- 400 `VALIDATION_ERROR` when `page` or `limit` are out of range.

### GET /products/:id
- 200: same fields as the list plus `description`, `vatIncludedInCents` and `maxPurchaseQuantity` (= min(stock, 10)).
- 400 `VALIDATION_ERROR` (non-uuid id) · 404 `PRODUCT_NOT_FOUND`.

### GET /locations/departments
- 200: `{ "data": [ { "code": "05", "name": "Antioquia" } ] }`

### GET /locations/departments/:code/municipalities
- 200: `{ "data": [ { "code": "05001", "name": "Medellín", "isMetroArea": true } ] }`
- 404 `DEPARTMENT_NOT_FOUND`.

### GET /quotes?productId=…&quantity=2&municipalityCode=05001
A side-effect-free calculation, therefore GET (safe, idempotent and cacheable).
- 200 (example: 2 × 1,899,900 COP shipped to Medellín):
```json
{ "data": {
    "product": { "id": "…", "name": "WH-1000XM5", "unitPriceInCents": 189990000 },
    "quantity": 2,
    "subtotalInCents": 379980000,
    "vatIncludedInCents": 60669100,
    "baseFeeInCents": 12066000,
    "delivery": { "feeInCents": 0, "rule": "FREE_METRO", "distanceKm": 4,
                  "warehouse": { "id": "…", "name": "Medellín DC" } },
    "totalInCents": 392046000,
    "currency": "COP" } }
```
- 400 `VALIDATION_ERROR` (quantity outside 1–10) · 409 `OUT_OF_STOCK` · 422 `PRODUCT_NOT_FOUND` / `MUNICIPALITY_NOT_FOUND`.

### POST /customers
- Body: `{ "documentNumber": "1017234567", "fullName": "Ana Pérez", "email": "ana@mail.com", "phone": "3001234567" }`
- 201 (created) or 200 (updated): `{ "data": { "id", "documentNumber", "fullName", "email", "phone" } }`
- 400 `VALIDATION_ERROR` · 409 `EMAIL_ALREADY_REGISTERED` · 409 `CUSTOMER_DATA_MISMATCH`.

### GET /customers/:id
- 200: `{ "data": { "id", "documentNumber", "fullName", "email", "phone" } }` · 404 `CUSTOMER_NOT_FOUND`.
- Documented trade-off: without authentication, the uuid (122 random bits) acts as an access capability.

### POST /transactions
- Headers: `Idempotency-Key: <uuid v4>` (mandatory).
- Body:
```json
{ "customerId": "…", "productId": "…", "quantity": 2, "installments": 1,
  "expectedTotalInCents": 392046000,
  "payment": { "cardToken": "tok_…", "cardBrand": "VISA", "cardLast4": "4242",
               "acceptanceToken": "eyJ…", "personalAuthToken": "eyJ…" },
  "delivery": { "recipientName": "Ana Pérez", "phone": "3001234567",
                "addressLine": "Cra 43A # 1-50", "addressDetail": "Apto 301",
                "municipalityCode": "05001" } }
```
- The body carries no amount the backend uses: the backend computes the total itself. `expectedTotalInCents` is the total the user saw, used only for comparison.
- Flow:
  1. Validate the body and the idempotency key.
  2. Check the circuit breaker.
  3. Recompute the quote and compare it with `expectedTotalInCents`.
  4. In one DB transaction: reserve stock and insert `transactions` (PENDING) and `deliveries` (AWAITING_PAYMENT).
  5. Call the gateway and store `provider_transaction_id`.
- 201 + `Location: /api/v1/transactions/{id}`:
```json
{ "data": { "id": "…", "reference": "TX-20260926-8F3K2Q", "status": "PENDING",
            "totalInCents": 392046000, "currency": "COP",
            "delivery": { "id": "…", "status": "AWAITING_PAYMENT" },
            "createdAt": "2026-09-26T15:04:05Z" } }
```
- If the gateway rejects the request (e.g. an invalid or already used token), the response is still 201 with `status: "ERROR"` and a `statusMessage`: the transaction exists and the stock has already been released.
- A replay with the same key and the same body returns the same 201 plus the `Idempotent-Replayed: true` header. Nothing is charged again.
- Errors:

| HTTP | code | When |
|---|---|---|
| 400 | `MISSING_IDEMPOTENCY_KEY` | Header missing or not a uuid |
| 400 | `VALIDATION_ERROR` | Invalid body (quantity, installments, phone, unknown fields, etc.) |
| 409 | `OUT_OF_STOCK` | The conditional stock update affected 0 rows |
| 409 | `PRICE_CHANGED` | The recomputed total differs from `expectedTotalInCents`; the frontend re-quotes |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Same key with a different body |
| 422 | `CUSTOMER_NOT_FOUND` / `PRODUCT_NOT_FOUND` / `MUNICIPALITY_NOT_FOUND` | References in the body that do not exist |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 503 | `PAYMENT_GATEWAY_UNAVAILABLE` | Circuit breaker open. Checked **before** reserving, so nothing is created. Includes `Retry-After`. |

### GET /transactions/:id
- While the transaction is PENDING and has a `provider_transaction_id`, it syncs with the gateway (8 s timeout) before responding.
- 200:
```json
{ "data": { "id": "…", "reference": "TX-…", "status": "APPROVED", "statusMessage": null,
            "product": { "id": "…", "name": "WH-1000XM5", "imageUrl": "…" },
            "quantity": 2, "installments": 1,
            "amounts": { "unitPriceInCents": 189990000, "subtotalInCents": 379980000,
                         "baseFeeInCents": 12066000, "deliveryFeeInCents": 0,
                         "totalInCents": 392046000, "currency": "COP" },
            "card": { "brand": "VISA", "last4": "4242" },
            "delivery": { "id": "…", "status": "READY_TO_SHIP" },
            "createdAt": "…", "finalizedAt": "…" } }
```
- While still PENDING it adds `Retry-After: 2`, which tells the frontend how often to poll.
- 400 · 404 `TRANSACTION_NOT_FOUND`.
- Never exposes the customer's email or national ID.

### GET /deliveries/:id
- 200:
```json
{ "data": { "id": "…", "transactionId": "…", "status": "READY_TO_SHIP",
            "warehouse": { "id": "…", "name": "Medellín DC", "municipalityName": "Medellín" },
            "destination": { "recipientName": "Ana Pérez", "addressLine": "Cra 43A # 1-50",
                             "addressDetail": "Apto 301", "municipalityName": "Medellín",
                             "departmentName": "Antioquia" },
            "distanceKm": 4, "feeRule": "FREE_METRO", "createdAt": "…", "updatedAt": "…" } }
```
- 400 · 404 `DELIVERY_NOT_FOUND`.

### POST /webhooks/payments
- Receives the gateway event (`transaction.updated`) with the `X-Event-Checksum` header.
- Checksum validation: the values listed in `signature.properties`, then `timestamp`, then the events secret, concatenated and hashed with SHA-256.
- 200 `{ "data": { "received": true } }`, also for unknown or repeated events (idempotent).
- 401 `INVALID_SIGNATURE`. Not subject to per-IP rate limiting.

### GET /health
- 200 `{ "data": { "status": "ok", "database": "up" } }` · 503 when the database does not respond.

## 4. Domain error → HTTP (ROP, one single mapper)

Use cases return `Err(DomainError)`. A single `DomainErrorMapper` in the HTTP layer translates them; controllers never handle errors themselves.

| Error kind | HTTP |
|---|---|
| Validation (DTOs, pipes) | 400 |
| Path resource not found | 404 |
| State conflict (stock, price, customer data) | 409 |
| Non-existent body reference / reused idempotency key | 422 |
| Rate limit | 429 |
| Gateway unavailable (circuit open) | 503 |
| Invalid webhook checksum | 401 |
| Anything else | 500 `INTERNAL_ERROR`, without internal details |

## 5. Calls the frontend makes directly to the gateway (public key)
- `GET {GATEWAY_URL}/merchants/{publicKey}` → acceptance tokens and their permalinks.
- `POST {GATEWAY_URL}/tokens/cards` → `{ id, brand, last_four, … }`.
- The CSP `connect-src` directive must allow the sandbox URL.

## 6. To verify during the gateway spike
- Whether the transaction response includes `brand` / `last_four` (if so, they override the values sent by the frontend).
- Whether transactions can be looked up by `reference`, to resolve ambiguous POST timeouts.
