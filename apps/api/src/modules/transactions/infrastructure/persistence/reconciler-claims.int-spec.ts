import { randomUUID } from 'node:crypto';

import type { EntityManager, QueryRunner } from 'typeorm';

import dataSource from '../../../../shared/infrastructure/persistence/data-source';
import { TypeOrmTxContext } from '../../../../shared/infrastructure/persistence/typeorm-tx-context';
import { RECONCILER_LEASE_MS } from '../../domain/reconciler.constants';
import type { NewTransaction } from '../../domain/transaction';
import { TypeOrmTransactionRepository } from './typeorm-transaction.repository';

// Same self-contained fixture pattern as typeorm-transaction.repository.int-spec.ts
// (a transaction FKs into customers/products, neither importable directly here —
// see references/layering.md). Duplicated rather than shared, matching the
// existing convention across this module's int-specs.
function randomDocumentNumber(): string {
  return String(1_000_000 + Math.floor(Math.random() * 8_999_999));
}

function randomPhone(): string {
  const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `3${suffix}`;
}

async function insertCustomer(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO customers (document_number, email, full_name, phone)
     VALUES ($1, $2, 'Reconciler Claims Int Test', $3)
     RETURNING id`,
    [randomDocumentNumber(), `${randomUUID()}@example.com`, randomPhone()],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test customer');
  return id;
}

async function insertProduct(manager: EntityManager): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO products (sku, name, brand, description, price_cents, image_url, stock_available, stock_reserved)
     VALUES ($1, 'Reconciler Claims Test Product', 'Test Brand', 'Integration test description', 100000, '/images/products/test-640.webp', 10, 0)
     RETURNING id`,
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert test product');
  return id;
}

async function buildFixtureIds(
  manager: EntityManager,
): Promise<{ customerId: string; productId: string }> {
  const [customerId, productId] = await Promise.all([
    insertCustomer(manager),
    insertProduct(manager),
  ]);
  return { customerId, productId };
}

function buildNewTransaction(
  fields: { customerId: string; productId: string },
  overrides: Partial<NewTransaction> = {},
): NewTransaction {
  return {
    reference: overrides.reference ?? `TX-${randomUUID().slice(0, 8).toUpperCase()}`,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    requestHash: overrides.requestHash ?? '0'.repeat(64),
    customerId: fields.customerId,
    productId: fields.productId,
    quantity: overrides.quantity ?? 1,
    unitPriceInCents: overrides.unitPriceInCents ?? 100_000,
    subtotalInCents: overrides.subtotalInCents ?? 100_000,
    baseFeeInCents: overrides.baseFeeInCents ?? 0,
    deliveryFeeInCents: overrides.deliveryFeeInCents ?? 0,
    totalInCents: overrides.totalInCents ?? 100_000,
    currency: overrides.currency ?? 'COP',
    installments: overrides.installments ?? 1,
    cardBrand: overrides.cardBrand ?? 'VISA',
    cardLast4: overrides.cardLast4 ?? '4242',
    reservationExpiresAt: overrides.reservationExpiresAt ?? new Date(Date.now() + 5 * 60_000),
  };
}

// Test-only: simulates a row that was claimed a while ago (or never
// touched), i.e. moves it outside every claim's lease window, without going
// through the leased UPDATE itself.
async function backdateUpdatedAt(manager: EntityManager, id: string, at: Date): Promise<void> {
  await manager.query('UPDATE transactions SET updated_at = $2 WHERE id = $1', [id, at]);
}

async function backdateFinalizedAt(manager: EntityManager, id: string, at: Date): Promise<void> {
  await manager.query('UPDATE transactions SET finalized_at = $2 WHERE id = $1', [id, at]);
}

const FAR_PAST = new Date('2020-01-01T00:00:00.000Z');

describe('reconciler leased claims', () => {
  let queryRunner: QueryRunner;
  let repository: TypeOrmTransactionRepository;
  let tx: TypeOrmTxContext;

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    repository = new TypeOrmTransactionRepository(queryRunner.manager);
    tx = new TypeOrmTxContext(queryRunner.manager);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  describe('claimPendingForSync', () => {
    async function seedSyncable(): Promise<string> {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const inserted = (
        await repository.insert(tx, buildNewTransaction({ customerId, productId }))
      )._unsafeUnwrap();
      await repository.recordGatewayResponse(tx, {
        id: inserted.id,
        providerTransactionId: `gw-${inserted.id}`,
        statusMessage: null,
      });
      await backdateUpdatedAt(queryRunner.manager, inserted.id, FAR_PAST);
      return inserted.id;
    }

    it('claims only PENDING rows with a provider id, older than olderThan, and bumps their lease', async () => {
      const syncableId = await seedSyncable();
      // Not eligible: no provider id yet.
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const withoutProviderId = (
        await repository.insert(tx, buildNewTransaction({ customerId, productId }))
      )._unsafeUnwrap();
      await backdateUpdatedAt(queryRunner.manager, withoutProviderId.id, FAR_PAST);

      const claimed = (
        await repository.claimPendingForSync(tx, { olderThan: new Date(), limit: 20 })
      )._unsafeUnwrap();
      const claimedIds = claimed.map((row) => row.id);

      // A real Postgres may hold committed rows from other int-specs (e.g.
      // the concurrency suites, which commit for real), so assertions are
      // scoped to this test's own fixtures rather than the whole result set.
      expect(claimedIds).toContain(syncableId);
      expect(claimedIds).not.toContain(withoutProviderId.id);
      const claimedRow = claimed.find((row) => row.id === syncableId);
      expect(claimedRow?.updatedAt.getTime()).toBeGreaterThan(FAR_PAST.getTime());
    });

    it('does not re-claim a row within its lease, but does after the lease expires', async () => {
      const syncableId = await seedSyncable();
      // Mirrors how ReconcileTransactionsUseCase derives olderThan
      // (clock.now() - RECONCILER_LEASE_MS): the claim itself has no notion
      // of "lease" beyond the caller-supplied threshold.
      const leaseOlderThan = (): Date => new Date(Date.now() - RECONCILER_LEASE_MS);

      const firstClaim = (
        await repository.claimPendingForSync(tx, { olderThan: leaseOlderThan(), limit: 20 })
      )._unsafeUnwrap();
      expect(firstClaim.map((row) => row.id)).toContain(syncableId);

      const secondClaimImmediately = (
        await repository.claimPendingForSync(tx, { olderThan: leaseOlderThan(), limit: 20 })
      )._unsafeUnwrap();
      expect(secondClaimImmediately.map((row) => row.id)).not.toContain(syncableId);

      await backdateUpdatedAt(queryRunner.manager, syncableId, FAR_PAST);
      const claimAfterLeaseExpired = (
        await repository.claimPendingForSync(tx, { olderThan: leaseOlderThan(), limit: 20 })
      )._unsafeUnwrap();
      expect(claimAfterLeaseExpired.map((row) => row.id)).toContain(syncableId);
    });

    it('honors limit', async () => {
      await seedSyncable();
      await seedSyncable();

      const claimed = (
        await repository.claimPendingForSync(tx, { olderThan: new Date(), limit: 1 })
      )._unsafeUnwrap();

      expect(claimed).toHaveLength(1);
    });
  });

  describe('claimExpiredReservations', () => {
    async function seedExpiredNoProviderId(): Promise<string> {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const inserted = (
        await repository.insert(
          tx,
          buildNewTransaction({ customerId, productId }, { reservationExpiresAt: FAR_PAST }),
        )
      )._unsafeUnwrap();
      await backdateUpdatedAt(queryRunner.manager, inserted.id, FAR_PAST);
      return inserted.id;
    }

    it('claims only PENDING rows without a provider id whose reservation expired, bumping their lease', async () => {
      const expiredId = await seedExpiredNoProviderId();
      // Not eligible: has a provider id (task (a)'s job, not (b)'s).
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const withProviderId = (
        await repository.insert(
          tx,
          buildNewTransaction({ customerId, productId }, { reservationExpiresAt: FAR_PAST }),
        )
      )._unsafeUnwrap();
      await repository.recordGatewayResponse(tx, {
        id: withProviderId.id,
        providerTransactionId: `gw-${withProviderId.id}`,
        statusMessage: null,
      });
      await backdateUpdatedAt(queryRunner.manager, withProviderId.id, FAR_PAST);
      // Not eligible: reservation not expired yet.
      const notExpired = (
        await repository.insert(tx, buildNewTransaction({ customerId, productId }))
      )._unsafeUnwrap();
      await backdateUpdatedAt(queryRunner.manager, notExpired.id, FAR_PAST);

      const claimed = (
        await repository.claimExpiredReservations(tx, { now: new Date(), limit: 20 })
      )._unsafeUnwrap();
      const claimedIds = claimed.map((row) => row.id);

      expect(claimedIds).toContain(expiredId);
      expect(claimedIds).not.toContain(withProviderId.id);
      expect(claimedIds).not.toContain(notExpired.id);
      const claimedRow = claimed.find((row) => row.id === expiredId);
      expect(claimedRow?.updatedAt.getTime()).toBeGreaterThan(FAR_PAST.getTime());
    });

    it('does not re-claim a row within its lease, but does after the lease expires', async () => {
      const expiredId = await seedExpiredNoProviderId();

      const firstClaim = (
        await repository.claimExpiredReservations(tx, { now: new Date(), limit: 20 })
      )._unsafeUnwrap();
      expect(firstClaim.map((row) => row.id)).toContain(expiredId);

      const secondClaimImmediately = (
        await repository.claimExpiredReservations(tx, { now: new Date(), limit: 20 })
      )._unsafeUnwrap();
      expect(secondClaimImmediately.map((row) => row.id)).not.toContain(expiredId);

      await backdateUpdatedAt(queryRunner.manager, expiredId, FAR_PAST);
      const claimAfterLeaseExpired = (
        await repository.claimExpiredReservations(tx, { now: new Date(), limit: 20 })
      )._unsafeUnwrap();
      expect(claimAfterLeaseExpired.map((row) => row.id)).toContain(expiredId);
    });

    it('honors limit', async () => {
      await seedExpiredNoProviderId();
      await seedExpiredNoProviderId();

      const claimed = (
        await repository.claimExpiredReservations(tx, { now: new Date(), limit: 1 })
      )._unsafeUnwrap();

      expect(claimed).toHaveLength(1);
    });
  });

  describe('findUnsentEmails', () => {
    async function seedUnsentFinal(): Promise<string> {
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const inserted = (
        await repository.insert(tx, buildNewTransaction({ customerId, productId }))
      )._unsafeUnwrap();
      await repository.finalize(tx, { id: inserted.id, status: 'EXPIRED', statusMessage: null });
      await backdateFinalizedAt(queryRunner.manager, inserted.id, FAR_PAST);
      await backdateUpdatedAt(queryRunner.manager, inserted.id, FAR_PAST);
      return inserted.id;
    }

    it('finds only final rows without an email, finalized before finalizedBefore, and bumps their lease', async () => {
      const unsentId = await seedUnsentFinal();
      // Not eligible: still PENDING.
      const { customerId, productId } = await buildFixtureIds(queryRunner.manager);
      const stillPending = (
        await repository.insert(tx, buildNewTransaction({ customerId, productId }))
      )._unsafeUnwrap();
      // Not eligible: already emailed.
      const alreadyEmailedId = await seedUnsentFinal();
      await repository.markEmailSent(tx, alreadyEmailedId);

      const found = (
        await repository.findUnsentEmails({ finalizedBefore: new Date(), limit: 1000 })
      )._unsafeUnwrap();
      const foundIds = found.map((row) => row.id);

      // A real Postgres may hold committed rows from other int-specs (e.g.
      // the concurrency suites, which commit for real), so assertions are
      // scoped to this test's own fixtures rather than the whole result set.
      expect(foundIds).toContain(unsentId);
      expect(foundIds).not.toContain(stillPending.id);
      expect(foundIds).not.toContain(alreadyEmailedId);
      const foundRow = found.find((row) => row.id === unsentId);
      expect(foundRow?.updatedAt.getTime()).toBeGreaterThan(FAR_PAST.getTime());
    });

    it('does not re-find a row within its lease, but does after the lease expires', async () => {
      const unsentId = await seedUnsentFinal();

      const firstFind = (
        await repository.findUnsentEmails({ finalizedBefore: new Date(), limit: 1000 })
      )._unsafeUnwrap();
      expect(firstFind.map((row) => row.id)).toContain(unsentId);

      const secondFindImmediately = (
        await repository.findUnsentEmails({ finalizedBefore: new Date(), limit: 1000 })
      )._unsafeUnwrap();
      expect(secondFindImmediately.map((row) => row.id)).not.toContain(unsentId);

      await backdateUpdatedAt(queryRunner.manager, unsentId, FAR_PAST);
      const findAfterLeaseExpired = (
        await repository.findUnsentEmails({ finalizedBefore: new Date(), limit: 1000 })
      )._unsafeUnwrap();
      expect(findAfterLeaseExpired.map((row) => row.id)).toContain(unsentId);
    });

    it('honors limit', async () => {
      await seedUnsentFinal();
      await seedUnsentFinal();

      const found = (
        await repository.findUnsentEmails({ finalizedBefore: new Date(), limit: 1 })
      )._unsafeUnwrap();

      expect(found).toHaveLength(1);
    });
  });
});
