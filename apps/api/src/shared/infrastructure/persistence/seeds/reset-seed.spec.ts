import { assertSeedResetAllowed, SeedResetRefusedError } from './reset-seed';

describe('assertSeedResetAllowed', () => {
  it('allows resetting outside production with no pending transactions', () => {
    expect(() =>
      assertSeedResetAllowed({ nodeEnv: 'development', pendingTransactionCount: 0 }),
    ).not.toThrow();
  });

  it('refuses when NODE_ENV is production', () => {
    expect(() =>
      assertSeedResetAllowed({ nodeEnv: 'production', pendingTransactionCount: 0 }),
    ).toThrow(SeedResetRefusedError);
  });

  it('refuses when a PENDING transaction exists', () => {
    expect(() =>
      assertSeedResetAllowed({ nodeEnv: 'development', pendingTransactionCount: 1 }),
    ).toThrow(SeedResetRefusedError);
  });

  it('refuses production even alongside pending transactions', () => {
    expect(() =>
      assertSeedResetAllowed({ nodeEnv: 'production', pendingTransactionCount: 3 }),
    ).toThrow(SeedResetRefusedError);
  });
});
