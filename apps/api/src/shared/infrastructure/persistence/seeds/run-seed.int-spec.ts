import dataSource from '../data-source';
import { seedWithManager } from './run-seed';

class RollbackForTest extends Error {}

describe('seedWithManager', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('inserts every seed key once and nothing on the second run, whether or not the DB was already seeded', async () => {
    await dataSource
      .transaction(async (manager) => {
        await seedWithManager(manager);

        const municipality: unknown[] = await manager.query(
          `SELECT code FROM municipalities WHERE code = $1`,
          ['05001'],
        );
        expect(municipality).toHaveLength(1);

        const warehouse: unknown[] = await manager.query(
          `SELECT id FROM warehouses WHERE id = $1`,
          ['0b7c1f2e-5d4a-4e8b-9c1a-3f2d6e7a8b01'],
        );
        expect(warehouse).toHaveLength(1);

        const product: unknown[] = await manager.query(`SELECT sku FROM products WHERE sku = $1`, [
          'HP-SNY-WH1000XM5',
        ]);
        expect(product).toHaveLength(1);

        const second = await seedWithManager(manager);
        expect(second).toEqual({ municipalities: 0, warehouses: 0, products: 0 });

        // Never commits, so this test leaves no data behind and passes
        // whether or not the local database was already seeded.
        throw new RollbackForTest();
      })
      .catch((error: unknown) => {
        if (!(error instanceof RollbackForTest)) {
          throw error;
        }
      });
  });
});
