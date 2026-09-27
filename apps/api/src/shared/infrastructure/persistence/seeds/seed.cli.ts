import dataSource from '../data-source';
import { runSeed } from './run-seed';

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const summary = await runSeed(dataSource);
    console.log(
      `Seeded ${summary.municipalities} municipalities, ${summary.warehouses} warehouses, ${summary.products} products.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

void main();
