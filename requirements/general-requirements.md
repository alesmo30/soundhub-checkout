# General Requirements — Single-Product Card Checkout (v1.5)

> Deadline: Monday 8:00 a.m. (Colombia time, UTC-5).
> All amounts are in COP and stored as integer cents (`bigint`). Floats are never used for money.
> Cross-cutting rule: the payment provider's brand name must not appear anywhere in the repository, the code, or environment variable names. The provider is referred to generically as the "payment gateway".

---

## 1. Functional Requirements (FR)

### Catalog and stock
| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-01 | Paginated product list | 15 seeded products, 10 per page. Each card shows the image, name, price (VAT included) and available units. Products with no stock show an "Out of stock" badge. |
| FR-02 | Product page | Shows the description, the price with the included VAT broken down, the available stock, and a quantity selector from 1 to min(stock, **10**). The **"Pay with credit card"** button is disabled when there is no stock. |
| FR-03 | Real stock | The displayed stock is the available stock, excluding in-flight reservations. After step 4, the product is re-fetched and shows the updated stock. |

### Step 2 — Card and delivery (modal)
| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-04 | Card form | Asks for the number, holder name, expiry (MM/YY) and CVC. Validates the number with the Luhn check, that the expiry is in the future, and that the CVC has 3 digits. Errors are shown inline. |
| FR-05 | Card brand detection | Shows the VISA logo (starts with 4) or the MasterCard logo (51–55 / 2221–2720) while the user types. |
| FR-06 | Installments | Selector from 1 to 36 installments; defaults to 1. |
| FR-07 | Customer and delivery data | Asks for full name, national ID number (cédula, 6–10 digits), email, mobile phone (10 digits starting with 3), department and municipality (cascading selects backed by the official DIVIPOLA catalog), address, and an optional address complement. |
| FR-08 | Legal acceptances | Two mandatory checkboxes linking to the gateway's terms and to the personal-data authorization. The acceptance tokens are obtained from `GET /merchants/{public_key}`. |
| FR-09 | Tokenization | On continue, the frontend tokenizes the card directly with the gateway using the public key. Only `{ token, brand, last4 }` is kept. The card number and CVC never reach the backend or the persisted state. |
| FR-10 | Remember my details | A "Remember my details on this device" checkbox pre-fills the next purchase. A "Not me / Forget my details" button clears that state. |

### Step 3 — Summary (backdrop)
| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-11 | Server-side quote | The backend computes the subtotal, the base fee and the delivery fee from `productId`, `quantity` and `municipalityCode`. The frontend never sends amounts. |
| FR-12 | Base fee | Always applied: `round((subtotal × 2.65% + 700) × 1.19)`. It mirrors the gateway's card commission plus VAT. |
| FR-13 | Dynamic delivery fee (Strategy pattern) | Evaluated in order, first match wins: (1) municipality in the Aburrá Valley metro area and subtotal ≥ 200,000 → 0; (2) municipality in the Aburrá Valley metro area → 20,000; (3) rest of the country → 20,000 + 60 COP per km beyond the first 50 km to the nearest warehouse (Haversine distance), rounded up to the nearest 500, capped at 60,000. |
| FR-14 | Presentation | A backdrop showing product × quantity, the subtotal (VAT included), the base fee, the delivery fee with its label ("Free delivery", etc.), the total, the masked card (•••• 4242) and the delivery address. It has "Edit" and "Pay" buttons. On mobile it is rendered as a bottom sheet. |

### Step 4 — Payment and final status
| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-15 | Create or update the customer | `POST /customers` upserts by national ID number and returns `customerId`. New ID → created (409 `EMAIL_ALREADY_REGISTERED` if the email belongs to another ID). Existing ID with the same email → name and phone are updated. Existing ID with a different email → 409 `CUSTOMER_DATA_MISMATCH` and nothing is overwritten. |
| FR-16 | Create the PENDING transaction | `POST /transactions` with an `Idempotency-Key` header: generates the reference, reserves stock atomically with `reservation_expires_at = now() + 5 min`, creates the delivery in `AWAITING_PAYMENT`, and responds 201 with `{ id, reference, status: PENDING }`. |
| FR-17 | Charge through the gateway | The backend creates the gateway transaction using the private key, the integrity signature and the acceptance tokens, and stores `provider_transaction_id`. |
| FR-18 | Status tracking | The frontend polls `GET /transactions/:id` every 2 s. While the transaction is PENDING, the backend syncs with the gateway. After 60 s, the frontend shows "Payment under review" and the reconciler completes the process. |
| FR-19 | Finalization | APPROVED: commits the reserved stock and moves the delivery to `READY_TO_SHIP`. DECLINED, VOIDED, ERROR or EXPIRED: releases the reservation and moves the delivery to `CANCELLED`. In every case it publishes a `transaction.finalized` event. |
| FR-20 | Final status screen | Shows the result, reference, total, masked card and delivery status. The "Back to product" button returns to the product page with the updated stock. ERROR and DECLINED messages are clear and allow a retry. |

### Client-side resilience
| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-21 | Progress recovery | A refresh at any step restores the step, product, quantity, delivery data and `{ token, brand, last4 }`. If the token is missing, the card is requested again. |
| FR-22 | Payment resumption | A refresh with a payment in flight resumes polling using the persisted `transactionId`. No second charge is created because the same `Idempotency-Key` is reused. |

### Asynchronous processes
| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-23 | Result email | Sent for **every** final status (APPROVED, DECLINED, ERROR, VOIDED), with one template per status. `transaction.finalized` goes to SQS, and a Lambda worker sends the email through the `EmailSender` port (Gmail SMTP adapter with Nodemailer). Idempotent through `email_sent_at`. |
| FR-24 | Reconciler | EventBridge Scheduler runs a Lambda **every 1 min** that: (a) syncs with the gateway the PENDING transactions that have a `provider_transaction_id` and are older than 1 min, and finalizes them; (b) expires, and releases the stock of, the transactions that **never** reached the gateway and whose `reservation_expires_at` has passed (TTL of **5 min**); (c) re-publishes `transaction.finalized` for finalized transactions whose `email_sent_at` is still null 5 min after `finalized_at`. It never releases stock for a transaction the gateway still reports as PENDING. |
| FR-25 | Webhook (documented) | `POST /webhooks/payments` validates the checksum with the events secret and calls the same finalization use case. It is not registered in the gateway dashboard because the test account is shared. |

### API resources (the assignment requires stock, transactions, customers and deliveries)
| Method | Route | Purpose |
|---|---|---|
| GET | `/products?page=&limit=` | Catalog with stock |
| GET | `/products/:id` | Detail with stock |
| GET | `/locations/departments` | Departments catalog |
| GET | `/locations/departments/:code/municipalities` | Municipalities of a department |
| GET | `/quotes?productId=&quantity=&municipalityCode=` | Quote (subtotal, base fee, delivery fee, total). GET because it has no side effects |
| POST | `/customers` | Upsert by email |
| GET | `/customers/:id` | Pre-fill |
| POST | `/transactions` | Create PENDING and charge (with Idempotency-Key) |
| GET | `/transactions/:id` | Status, syncing with the gateway while PENDING |
| GET | `/deliveries/:id` | Delivery status |
| POST | `/webhooks/payments` | Gateway events |

### Seed
- FR-26: 15 headphones with images in S3/CloudFront and initial stock; 4 warehouses (Medellín, Bogotá, Cali, Barranquilla) with municipality, address and coordinates; and the `municipalities` table seeded from the official geolocated DIVIPOLA dataset (~1,100 municipalities, with DANE code, department, coordinates and an Aburrá Valley metro-area flag). There is no endpoint to create products.

---

## 2. Non-Functional Requirements (NFR)

### Security (OWASP bonus)
- NFR-S1: The PAN and CVC are never sent to the backend, stored, or logged. The database only keeps `card_brand` and `card_last4`.
- NFR-S2: The private key, integrity secret, events secret and SMTP password live in AWS Secrets Manager. They are never in the bundle or the repository.
- NFR-S3: End-to-end HTTPS through CloudFront, with security headers set by a Response Headers Policy (HSTS, CSP, X-Content-Type-Options, frame-ancestors 'none', Referrer-Policy, Permissions-Policy) and `helmet` in Nest. Target: grade A on Mozilla Observatory.
- NFR-S4: Strict validation on every DTO through a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`): unknown fields are rejected with 400, nested objects are validated recursively, and validation rules are shared with the frontend through `packages/shared`.
- NFR-S5: The frontend and the API share the same origin (`/api/*`), so no CORS is needed.
- NFR-S6: Throttling in API Gateway, plus a specific rate limit for `POST /transactions`.
- NFR-S7: No search-by-email or search-by-national-ID endpoint, to prevent enumeration of personal data.

### Consistency and reliability
- NFR-R1: Stock can never go negative. This is guaranteed by a conditional `UPDATE … WHERE stock_available >= qty` and `CHECK (… >= 0)` constraints.
- NFR-R2: Idempotency in 4 layers: the Idempotency-Key; never calling the gateway again once `provider_transaction_id` exists; the conditional finalization `WHERE status = 'PENDING'` together with a UNIQUE `deliveries.transaction_id`; and the worker's `email_sent_at`.
- NFR-R3: Gateway calls have an 8 s timeout. Retries with exponential backoff and jitter are only applied to GET requests. A POST that times out is never retried blindly; the reconciler resolves it. The gateway adapter has a circuit breaker.
- NFR-R4: All money arithmetic uses integer cents and is computed only on the server.
- NFR-R5: Soft deletes only. Every table has `created_at`, `updated_at` and `deleted_at`, and unique indexes are partial (`WHERE deleted_at IS NULL`). Transactions and deliveries are financial records: no endpoint or use case ever soft-deletes them.

### Performance
- NFR-P1: Images in WebP with `srcset`, explicit `width`/`height` and `loading="lazy"` (except the hero image). Served from CloudFront with immutable caching.
- NFR-P2: LCP < 2.5 s on mobile over 4G; initial bundle < 200 KB gzipped, with code splitting for the checkout modal.
- NFR-P3: API p95 < 500 ms excluding gateway latency. The Lambda is bundled with esbuild to reduce cold starts.

### UI, responsiveness and accessibility
- NFR-U1: Mobile-first design using the iPhone SE (375×667 px viewport) as reference. Works from 320 px up to desktop without overflow, using flexbox and grid.
- NFR-U2: Tested on Chrome, Safari (WebKit) and Firefox.
- NFR-U3: The modal and the backdrop trap focus, close with Esc, and have labels and `aria-*` attributes on every field. Loading and error states are visible.
- NFR-U4: **UI stack: Tailwind CSS v4 + shadcn/ui (Radix primitives).** Components are copied into the repository, so there is no CSS-in-JS runtime and the CSP can stay strict. Breakpoints are mobile-first (`sm` / `md` / `lg`). The summary backdrop uses a Drawer on mobile and a Dialog on desktop.
- NFR-U5: **Design tokens use the gateway's institutional palette**, defined in `@theme` with generic names (no brand name):
  - `brand-mint` #B0F2AE
  - `brand-forest` #00825A
  - `brand-lime` #DFFF61
  - `brand-sky` #99D1FC
  - `ink` #2C2A29
  - `paper` #FAFAFA

  AA contrast rules: text on lime, mint or sky is always `ink`. Primary buttons use an `ink` background with a `brand-lime` label (≈12:1), as in the gateway's hosted checkout; `brand-forest` is used for success states and links. Lime is never used as text on a light background. The gateway's logo and brand are not used.
- NFR-U6: Typography: Manrope (headings and amounts) and Open Sans (body and forms), self-hosted with `@fontsource` so no third-party font requests are made. The full design system lives in `apps/web/DESIGN.md`.

### Maintainability (bonus points)
- NFR-M1: Hexagonal architecture (domain / application / ports / adapters). Business logic never lives in controllers.
- NFR-M2: Railway Oriented Programming with a `Result<T, E>` in every use case (`neverthrow` library). Domain errors are translated to HTTP in a single place.
- NFR-M3: Monorepo (`apps/web`, `apps/api`, `packages/shared`, `infra`), strict TypeScript, ESLint and Prettier.
- NFR-M4: Frontend with Redux Toolkit following Flux; redux-persist only for the checkout and customer slices. Forms use react-hook-form + Zod through the shadcn/ui `Form` components; the Zod schemas live in `packages/shared` and their TypeScript types are inferred with `z.infer`.
- NFR-M5: One branch and one PR per feature, with frequent conventional commits.
- NFR-M6: Persistence with TypeORM and versioned migrations (`synchronize` is always off). ORM entities live in the infrastructure layer and are mapped to decorator-free domain models.

### Testing and evidence
- NFR-T1: Jest with coverage > 80% on statements, branches, functions and lines, **in both frontend and backend**, enforced by a `coverageThreshold` that fails CI when it drops.
- NFR-T2: Coverage results are published in the README.
- NFR-T3: **Mandatory visual validation of every frontend change** in Chrome (Claude in Chrome) at 375×667 (iPhone SE) and 1440×900. Screenshots are stored in `docs/evidence/<feature>/` and linked in the PR.
- NFR-T4: **E2E tests with Playwright** (`apps/e2e`), in two modes:
  - **CI mode (mocked):** the gateway is simulated with `page.route`, so tests are deterministic. Runs on the Chromium, WebKit and Firefox projects with mobile and desktop viewports, capturing screenshots at each step. Scenarios: APPROVED flow, DECLINED flow, refresh in the middle of checkout, card validations, and out-of-stock product.
  - **Smoke mode (real):** runs against the deployed URL and the sandbox using test cards 4242 and 4111. Run manually before delivery.
  - The HTML report and screenshots are linked in the README as evidence.
- NFR-T5: Playwright does not count toward Jest coverage; it is additional integration evidence.

### Operations and deployment
- NFR-O1: All infrastructure as code with AWS CDK in TypeScript: S3, CloudFront, API Gateway, Lambda, RDS, SQS, EventBridge and Secrets Manager.
- NFR-O2: Structured JSON logs with `x-request-id` in CloudWatch, without personal data.
- NFR-O3: Minimal cost: no NAT Gateway, small instance sizes.
- NFR-O4: GitHub Actions runs lint, tests with coverage, and Playwright (mocked mode) on every PR.

### Documentation (5 points)
- NFR-D1: README with the architecture (diagram), the data model, the public Swagger URL (`/api/docs`) and the Postman collection, how to run the project, the test cards, coverage, E2E and visual evidence, and trade-offs.

---

## 3. Out of scope
Shopping cart, purchase history, real authentication, refunds, 3DS, multiple warehouses with separate stock, address geocoding, and dark mode.

## 4. Confirmed assumptions
- Maximum quantity per purchase: 10 units.
- Stock reservation TTL: 5 minutes; the reconciler runs every 1 minute.
- An email is sent for every final status.
- Product prices are fixed in the seed for this proof of concept.
