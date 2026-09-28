// Coverage-excluded bootstrap file (see jest.config.ts's
// coveragePathIgnorePatterns): a manual, local run of the email use case
// against the local .env, exercised by hand (this spec's step 9 manual
// test), not by unit tests. Compiled through `nest start --entryFile` (see
// package.json's email:send-once script) rather than `tsx`, which emits no
// decorator metadata and would fail Nest's DI at cold start.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

async function runEmailSendOnce(): Promise<void> {
  const transactionId = process.argv[2];
  if (!transactionId) {
    // eslint-disable-next-line no-console -- CLI output, not application logging (see references/coding-conventions.md#c10).
    console.error('Usage: pnpm email:send-once <transactionId>');
    process.exitCode = 1;
    return;
  }

  const { AppModule } = await import('../app.module');
  const { SendTransactionEmailUseCase } = await import('../modules/notifications');

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const useCase = app.get(SendTransactionEmailUseCase);
    const outcome = (await useCase.execute(transactionId))._unsafeUnwrap();
    // eslint-disable-next-line no-console -- CLI output, not application logging.
    console.log(outcome);
  } finally {
    await app.close();
  }
}

runEmailSendOnce().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- CLI output, not application logging.
  console.error(error);
  process.exitCode = 1;
});
