# Design 01 — Data Model

> Engine: PostgreSQL 16 (Amazon RDS). ORM: TypeORM with versioned migrations (`synchronize` is always off).
> Money is stored as integer COP cents (`bigint`). Every table has `created_at`, `updated_at` and `deleted_at` (soft delete).

## 1. Overview

```
 municipalities (DIVIPOLA seed) ──< warehouses
        │
        └──────────────────────────< deliveries >── 1 transactions >── 1 customers
                                          │                │
                             warehouses 1 ┘                └──────── 1 products
```

| Relationship | Cardinality | Note |
|---|---|---|
| customers → transactions | 1 : N | |
| products → transactions | 1 : N | One product per transaction (no cart) |
| transactions → deliveries | 1 : 1 | `deliveries.transaction_id` is UNIQUE |
| warehouses → deliveries | 1 : N | The nearest warehouse is the shipping origin |
| municipalities → warehouses / deliveries | 1 : N | Official DANE code as natural key |

## 2. State machines

```
transactions.status   (our own status; the gateway adapter maps the provider's status into it)
  PENDING ─┬─▶ APPROVED
           ├─▶ DECLINED | VOIDED | ERROR
           └─▶ EXPIRED   (internal: never reached the gateway and the 5-min reservation expired)

deliveries.status
  AWAITING_PAYMENT ─┬─▶ READY_TO_SHIP   (transaction APPROVED)
                    └─▶ CANCELLED       (DECLINED / VOIDED / ERROR / EXPIRED)
```

Every transition is a conditional update (`WHERE status = 'PENDING'` / `'AWAITING_PAYMENT'`), which makes it idempotent.

## 3. DDL

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────── municipalities (DIVIPOLA seed) ───────────────────────────
CREATE TABLE municipalities (
  code             char(5)      PRIMARY KEY CHECK (code ~ '^[0-9]{5}$'),   -- official DANE code
  name             varchar(80)  NOT NULL,
  department_code  char(2)      NOT NULL CHECK (department_code ~ '^[0-9]{2}$'),
  department_name  varchar(80)  NOT NULL,
  latitude         numeric(9,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude        numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_metro_area    boolean      NOT NULL DEFAULT false,                    -- Aburrá Valley
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX idx_municipalities_department ON municipalities (department_code, name) WHERE deleted_at IS NULL;

-- ─────────────────────────── warehouses ───────────────────────────
CREATE TABLE warehouses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               varchar(100) NOT NULL,
  municipality_code  char(5)      NOT NULL REFERENCES municipalities(code),
  address            varchar(200) NOT NULL,
  latitude           numeric(9,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude          numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX idx_warehouses_municipality ON warehouses (municipality_code);

-- ─────────────────────────── products ─────────────────────────────
CREATE TABLE products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku              varchar(32)  NOT NULL,
  name             varchar(120) NOT NULL,
  brand            varchar(60)  NOT NULL,
  description      text         NOT NULL,
  price_cents      bigint       NOT NULL CHECK (price_cents > 0),     -- VAT included
  image_url        varchar(500) NOT NULL,
  stock_available  integer      NOT NULL DEFAULT 0 CHECK (stock_available >= 0),
  stock_reserved   integer      NOT NULL DEFAULT 0 CHECK (stock_reserved  >= 0),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE UNIQUE INDEX uq_products_sku      ON products (sku) WHERE deleted_at IS NULL;
CREATE INDEX        idx_products_listing ON products (created_at, id) WHERE deleted_at IS NULL;

-- ─────────────────────────── customers ────────────────────────────
CREATE TABLE customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number  varchar(10)  NOT NULL CHECK (document_number ~ '^[0-9]{6,10}$'),   -- national ID (cédula)
  email            varchar(254) NOT NULL,
  full_name        varchar(120) NOT NULL,
  phone            varchar(10)  NOT NULL CHECK (phone ~ '^3[0-9]{9}$'),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE UNIQUE INDEX uq_customers_document ON customers (document_number) WHERE deleted_at IS NULL;  -- upsert key
CREATE UNIQUE INDEX uq_customers_email    ON customers (lower(email))    WHERE deleted_at IS NULL;

-- ─────────────────────────── transactions ─────────────────────────
CREATE TABLE transactions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference                varchar(32)  NOT NULL UNIQUE,          -- sent to the gateway and signed
  idempotency_key          uuid         NOT NULL UNIQUE,          -- Idempotency-Key header
  request_hash             char(64)     NOT NULL,                 -- SHA-256 of the canonical body → 422 on mismatch
  customer_id              uuid         NOT NULL REFERENCES customers(id),
  product_id               uuid         NOT NULL REFERENCES products(id),
  quantity                 smallint     NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_cents         bigint       NOT NULL CHECK (unit_price_cents > 0),   -- price snapshot
  subtotal_cents           bigint       NOT NULL,
  base_fee_cents           bigint       NOT NULL CHECK (base_fee_cents     >= 0),
  delivery_fee_cents       bigint       NOT NULL CHECK (delivery_fee_cents >= 0),
  total_cents              bigint       NOT NULL,
  currency                 char(3)      NOT NULL DEFAULT 'COP' CHECK (currency = 'COP'),
  status                   varchar(16)  NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','APPROVED','DECLINED','VOIDED','ERROR','EXPIRED')),
  installments             smallint     NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 36),
  card_brand               varchar(12)  NOT NULL CHECK (card_brand IN ('VISA','MASTERCARD')),
  card_last4               char(4)      NOT NULL CHECK (card_last4 ~ '^[0-9]{4}$'),
  provider_transaction_id  varchar(64)  UNIQUE,                   -- null until the gateway responds
  provider_status_message  varchar(255),
  reservation_expires_at   timestamptz  NOT NULL,                 -- created_at + 5 min
  finalized_at             timestamptz,
  email_sent_at            timestamptz,
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  deleted_at               timestamptz,                           -- never set by any use case (financial record)

  CONSTRAINT chk_subtotal  CHECK (subtotal_cents = unit_price_cents * quantity),
  CONSTRAINT chk_total     CHECK (total_cents = subtotal_cents + base_fee_cents + delivery_fee_cents),
  CONSTRAINT chk_finalized CHECK ((status = 'PENDING') = (finalized_at IS NULL))
);
CREATE INDEX idx_tx_customer    ON transactions (customer_id);
CREATE INDEX idx_tx_product     ON transactions (product_id);
CREATE INDEX idx_tx_pending     ON transactions (reservation_expires_at) WHERE status = 'PENDING';
CREATE INDEX idx_tx_email_retry ON transactions (finalized_at) WHERE status <> 'PENDING' AND email_sent_at IS NULL;

-- ─────────────────────────── deliveries ───────────────────────────
CREATE TABLE deliveries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     uuid         NOT NULL UNIQUE REFERENCES transactions(id),
  warehouse_id       uuid         NOT NULL REFERENCES warehouses(id),
  municipality_code  char(5)      NOT NULL REFERENCES municipalities(code),
  status             varchar(20)  NOT NULL DEFAULT 'AWAITING_PAYMENT'
                     CHECK (status IN ('AWAITING_PAYMENT','READY_TO_SHIP','CANCELLED')),
  recipient_name     varchar(120) NOT NULL,
  phone              varchar(10)  NOT NULL CHECK (phone ~ '^3[0-9]{9}$'),
  address_line       varchar(200) NOT NULL,
  address_detail     varchar(120),
  distance_km        integer      NOT NULL CHECK (distance_km >= 0),
  fee_rule           varchar(24)  NOT NULL
                     CHECK (fee_rule IN ('FREE_METRO','METRO_FLAT','NATIONAL_DISTANCE')),
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  deleted_at         timestamptz                                   -- never set by any use case (financial record)
);
CREATE INDEX idx_deliveries_warehouse    ON deliveries (warehouse_id);
CREATE INDEX idx_deliveries_municipality ON deliveries (municipality_code);
```

## 4. Stock operations (each block runs in one DB transaction, READ COMMITTED)

| Moment | `stock_available` | `stock_reserved` |
|---|---|---|
| PENDING transaction created (reserve) | −qty | +qty |
| APPROVED (commit) | — | −qty |
| DECLINED / VOIDED / ERROR / EXPIRED (release) | +qty | −qty |

```sql
-- RESERVE (together with the INSERT into transactions and deliveries[AWAITING_PAYMENT])
UPDATE products SET stock_available = stock_available - :qty, stock_reserved = stock_reserved + :qty, updated_at = now()
 WHERE id = :productId AND stock_available >= :qty AND deleted_at IS NULL;      -- 0 rows → Err(OUT_OF_STOCK) → rollback

-- FINALIZE (idempotent)
UPDATE transactions SET status = :final, finalized_at = now(), updated_at = now(), provider_status_message = :msg
 WHERE id = :id AND status = 'PENDING' RETURNING product_id, quantity;           -- 0 rows → already finalized → no-op

--   APPROVED
UPDATE products   SET stock_reserved = stock_reserved - :qty, updated_at = now() WHERE id = :productId;
UPDATE deliveries SET status = 'READY_TO_SHIP', updated_at = now() WHERE transaction_id = :id AND status = 'AWAITING_PAYMENT';

--   DECLINED / VOIDED / ERROR / EXPIRED
UPDATE products   SET stock_available = stock_available + :qty, stock_reserved = stock_reserved - :qty, updated_at = now() WHERE id = :productId;
UPDATE deliveries SET status = 'CANCELLED', updated_at = now() WHERE transaction_id = :id AND status = 'AWAITING_PAYMENT';
```

- The UI displays `stock_available`.
- Each transaction holds a single product, so no `SELECT … FOR UPDATE` with lock ordering is needed: the conditional `UPDATE` locks the row atomically and there is no deadlock risk.

## 5. Distance calculation (backend, no address geocoding)

1. In the delivery form the user selects the department and then the municipality. The free-text address is only used for the shipping label.
2. The backend looks up the municipality by DANE code and uses its coordinates (municipal seat, from the geolocated DIVIPOLA dataset).
3. It computes the Haversine distance to every active warehouse and picks the nearest one, stored as `warehouse_id` and `distance_km`.
4. The `DeliveryFeeResolver` applies the strategies (`is_metro_area` decides FREE_METRO / METRO_FLAT) and the applied rule is stored in `fee_rule`.

## 6. Customer upsert rules (`POST /customers`)

| Case | Result |
|---|---|
| New national ID, unused email | 201, customer created |
| New national ID, email used by another ID | 409 `EMAIL_ALREADY_REGISTERED` |
| Existing national ID, same email | 200, name and phone updated |
| Existing national ID, different email | 409 `CUSTOMER_DATA_MISMATCH`, nothing overwritten |

The last rule prevents anyone from changing another person's email just by typing their national ID.

## 7. Design decisions

- **Soft deletes only.** Unique indexes are partial (`WHERE deleted_at IS NULL`) so a soft-deleted row never blocks re-creation. Transactions and deliveries keep the column for consistency, but no endpoint or use case ever sets it.
- **Snapshots, not references, for money.** `unit_price_cents` and every fee are copied at purchase time, so later price changes never alter a past transaction.
- **Own status enum.** The gateway adapter acts as an anti-corruption layer: provider statuses are mapped into the domain enum, and `EXPIRED` is internal.
- **`varchar` + `CHECK` instead of Postgres enums.** Easier to migrate and to map in TypeORM.
- **Haversine in the domain instead of PostGIS.** Only a handful of warehouses; distance is a pure, testable function.
- **Idempotency lives in `transactions`** (`idempotency_key` + `request_hash`), since there is only one idempotent endpoint.

## 8. TypeORM notes

- ORM entities live in `infrastructure/persistence` and are mapped to decorator-free domain models.
- `@DeleteDateColumn` provides `softDelete()` and automatic filtering in `find*`. Partial unique indexes use `@Index({ unique: true, where: '"deleted_at" IS NULL' })`.
- Conditional updates use the QueryBuilder and check `result.affected`.
