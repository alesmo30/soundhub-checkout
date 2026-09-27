import { SystemClock } from './system-clock';

describe('SystemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();

    const now = new SystemClock().now().getTime();

    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
