import type { MigrationInterface, QueryRunner } from 'typeorm';

// Reproduces docs/design/01-data-model.md §3 verbatim. TypeORM cannot
// generate partial indexes or compound CHECKs faithfully, so this migration
// is hand-written instead of generated.
export class InitialSchema1790463118000 implements MigrationInterface {
  name = 'InitialSchema1790463118000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await queryRunner.query(`
      CREATE TABLE municipalities (
        code             char(5)      PRIMARY KEY CHECK (code ~ '^[0-9]{5}$'),
        name             varchar(80)  NOT NULL,
        department_code  char(2)      NOT NULL CHECK (department_code ~ '^[0-9]{2}$'),
        department_name  varchar(80)  NOT NULL,
        latitude         numeric(9,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
        longitude        numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        is_metro_area    boolean      NOT NULL DEFAULT false,
        created_at       timestamptz  NOT NULL DEFAULT now(),
        updated_at       timestamptz  NOT NULL DEFAULT now(),
        deleted_at       timestamptz
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_municipalities_department ON municipalities (department_code, name) WHERE deleted_at IS NULL;`,
    );

    await queryRunner.query(`
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
    `);
    await queryRunner.query(
      `CREATE INDEX idx_warehouses_municipality ON warehouses (municipality_code);`,
    );

    await queryRunner.query(`
      CREATE TABLE products (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sku              varchar(32)  NOT NULL,
        name             varchar(120) NOT NULL,
        brand            varchar(60)  NOT NULL,
        description      text         NOT NULL,
        price_cents      bigint       NOT NULL CHECK (price_cents > 0),
        image_url        varchar(500) NOT NULL,
        stock_available  integer      NOT NULL DEFAULT 0 CHECK (stock_available >= 0),
        stock_reserved   integer      NOT NULL DEFAULT 0 CHECK (stock_reserved  >= 0),
        created_at       timestamptz  NOT NULL DEFAULT now(),
        updated_at       timestamptz  NOT NULL DEFAULT now(),
        deleted_at       timestamptz
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_products_sku      ON products (sku) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX        idx_products_listing ON products (created_at, id) WHERE deleted_at IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE customers (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_number  varchar(10)  NOT NULL CHECK (document_number ~ '^[0-9]{6,10}$'),
        email            varchar(254) NOT NULL,
        full_name        varchar(120) NOT NULL,
        phone            varchar(10)  NOT NULL CHECK (phone ~ '^3[0-9]{9}$'),
        created_at       timestamptz  NOT NULL DEFAULT now(),
        updated_at       timestamptz  NOT NULL DEFAULT now(),
        deleted_at       timestamptz
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_customers_document ON customers (document_number) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_customers_email    ON customers (lower(email))    WHERE deleted_at IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE transactions (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reference                varchar(32)  NOT NULL UNIQUE,
        idempotency_key          uuid         NOT NULL UNIQUE,
        request_hash             char(64)     NOT NULL,
        customer_id              uuid         NOT NULL REFERENCES customers(id),
        product_id               uuid         NOT NULL REFERENCES products(id),
        quantity                 smallint     NOT NULL CHECK (quantity BETWEEN 1 AND 10),
        unit_price_cents         bigint       NOT NULL CHECK (unit_price_cents > 0),
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
        provider_transaction_id  varchar(64)  UNIQUE,
        provider_status_message  varchar(255),
        reservation_expires_at   timestamptz  NOT NULL,
        finalized_at             timestamptz,
        email_sent_at            timestamptz,
        created_at               timestamptz  NOT NULL DEFAULT now(),
        updated_at               timestamptz  NOT NULL DEFAULT now(),
        deleted_at               timestamptz,

        CONSTRAINT chk_subtotal  CHECK (subtotal_cents = unit_price_cents * quantity),
        CONSTRAINT chk_total     CHECK (total_cents = subtotal_cents + base_fee_cents + delivery_fee_cents),
        CONSTRAINT chk_finalized CHECK ((status = 'PENDING') = (finalized_at IS NULL))
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_tx_customer    ON transactions (customer_id);`);
    await queryRunner.query(`CREATE INDEX idx_tx_product     ON transactions (product_id);`);
    await queryRunner.query(
      `CREATE INDEX idx_tx_pending     ON transactions (reservation_expires_at) WHERE status = 'PENDING';`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_tx_email_retry ON transactions (finalized_at) WHERE status <> 'PENDING' AND email_sent_at IS NULL;`,
    );

    await queryRunner.query(`
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
        deleted_at         timestamptz
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_deliveries_warehouse    ON deliveries (warehouse_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_deliveries_municipality ON deliveries (municipality_code);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS deliveries;`);
    await queryRunner.query(`DROP TABLE IF EXISTS transactions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS customers;`);
    await queryRunner.query(`DROP TABLE IF EXISTS products;`);
    await queryRunner.query(`DROP TABLE IF EXISTS warehouses;`);
    await queryRunner.query(`DROP TABLE IF EXISTS municipalities;`);
  }
}
