import { readFileSync } from 'node:fs';

import type { EntityManager } from 'typeorm';

export class SeedResetRefusedError extends Error {}

interface ProductSeed {
  sku: string;
  priceInCents: number;
  stock: number;
}

const DATA_DIR = 'src/shared/infrastructure/persistence/seeds/data';

function readSeededProducts(): ProductSeed[] {
  return JSON.parse(readFileSync(`${DATA_DIR}/products.json`, 'utf8')) as ProductSeed[];
}

// Resetting during a pending purchase would push stock_reserved negative at
// finalization, leaving the CHECK stuck against a PENDING transaction, so
// this never runs in production and never runs while one exists.
export function assertSeedResetAllowed(options: {
  nodeEnv: string;
  pendingTransactionCount: number;
}): void {
  if (options.nodeEnv === 'production') {
    throw new SeedResetRefusedError('seed:reset refuses to run when NODE_ENV is production');
  }

  if (options.pendingTransactionCount > 0) {
    throw new SeedResetRefusedError(
      `seed:reset refuses to run while ${options.pendingTransactionCount} PENDING transaction(s) exist`,
    );
  }
}

export async function resetSeedWithManager(
  manager: EntityManager,
  nodeEnv: string,
): Promise<number> {
  const pendingRows: Array<{ count: string }> = await manager.query(
    `SELECT count(*) AS count FROM transactions WHERE status = 'PENDING'`,
  );
  const pendingTransactionCount = Number(pendingRows[0]?.count ?? 0);

  assertSeedResetAllowed({ nodeEnv, pendingTransactionCount });

  const products = readSeededProducts();
  let updated = 0;

  for (const product of products) {
    // Only price and stock_available are restored; stock_reserved is never
    // touched here (see the guard above for why).
    // For UPDATE, manager.query() returns [rows, affectedCount], not the
    // bare rows array `query()` returns for INSERT/SELECT.
    const [, affectedCount]: [unknown[], number] = await manager.query(
      `UPDATE products SET price_cents = $1, stock_available = $2, updated_at = now() WHERE sku = $3 RETURNING sku`,
      [product.priceInCents, product.stock, product.sku],
    );
    updated += affectedCount;
  }

  return updated;
}
