import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('starts closed and allows requests', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, openDurationMs: 1000 });

    expect(breaker.canRequest()).toBe(true);
  });

  it('opens after the failure threshold is reached', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, openDurationMs: 1000 });
    const failing = () => Promise.reject(new Error('down'));

    await expect(breaker.execute(failing)).rejects.toThrow('down');
    expect(breaker.canRequest()).toBe(true);

    await expect(breaker.execute(failing)).rejects.toThrow('down');
    expect(breaker.canRequest()).toBe(false);
  });

  it('rejects with CircuitOpenError while open, without calling work', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, openDurationMs: 1000 });
    const work = jest.fn().mockRejectedValue(new Error('down'));

    await expect(breaker.execute(work)).rejects.toThrow('down');
    work.mockClear();

    await expect(breaker.execute(work)).rejects.toThrow(CircuitOpenError);
    expect(work).not.toHaveBeenCalled();
  });

  it('moves to half-open once openDurationMs has elapsed', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 1000,
      now: () => now,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('down')))).rejects.toThrow();
    expect(breaker.canRequest()).toBe(false);

    now += 999;
    expect(breaker.canRequest()).toBe(false);

    now += 1;
    expect(breaker.canRequest()).toBe(true);
  });

  it('closes again on a successful call while half-open', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 1000,
      now: () => now,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('down')))).rejects.toThrow();
    now += 1000;

    const result = await breaker.execute(() => Promise.resolve('ok'));

    expect(result).toBe('ok');
    expect(breaker.canRequest()).toBe(true);
  });

  it('reopens immediately on a failed call while half-open', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 1000,
      now: () => now,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('down')))).rejects.toThrow();
    now += 1000;
    expect(breaker.canRequest()).toBe(true);

    await expect(breaker.execute(() => Promise.reject(new Error('still down')))).rejects.toThrow();
    expect(breaker.canRequest()).toBe(false);

    now += 999;
    expect(breaker.canRequest()).toBe(false);
    now += 1;
    expect(breaker.canRequest()).toBe(true);
  });
});
