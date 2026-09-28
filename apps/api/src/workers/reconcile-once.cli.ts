// Coverage-excluded bootstrap file (see jest.config.ts's
// coveragePathIgnorePatterns): a manual, local run of the reconciler against
// the local .env, exercised by hand (spec step 10's manual test), not by
// unit tests. Compiled through `nest start --entryFile` (see package.json's
// reconcile:once script) rather than `tsx`, which emits no decorator
// metadata and would fail Nest's DI at cold start.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

async function runReconcileOnce(): Promise<void> {
  const { AppModule } = await import('../app.module');
  const { ReconcileTransactionsUseCase } = await import('../modules/transactions');

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const useCase = app.get(ReconcileTransactionsUseCase);
    const summary = (await useCase.execute())._unsafeUnwrap();
    // eslint-disable-next-line no-console -- CLI output, not application logging (see references/coding-conventions.md#c10).
    console.log(summary);
  } finally {
    await app.close();
  }
}

runReconcileOnce().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- CLI output, not application logging.
  console.error(error);
  process.exitCode = 1;
});
