import { retryWithBackoff } from './retry-with-backoff';

describe('retryWithBackoff', () => {
  it('returns the result on the first successful attempt without sleeping', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const work = jest.fn().mockResolvedValue('ok');

    const result = await retryWithBackoff(work, {
      retries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep,
    });

    expect(result).toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries up to the configured count and then succeeds', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const work = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('ok');

    const result = await retryWithBackoff(work, {
      retries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep,
    });

    expect(result).toBe('ok');
    expect(work).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('throws the last error once retries are exhausted', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const work = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retryWithBackoff(work, { retries: 2, baseDelayMs: 10, maxDelayMs: 100, sleep }),
    ).rejects.toThrow('always fails');
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const work = jest.fn().mockRejectedValue(new Error('not retryable'));

    await expect(
      retryWithBackoff(work, {
        retries: 5,
        baseDelayMs: 10,
        maxDelayMs: 100,
        sleep,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow('not retryable');
    expect(work).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('keeps every delay within [0, min(maxDelayMs, baseDelayMs * 2^attempt)]', async () => {
    const delays: number[] = [];
    const sleep = jest.fn().mockImplementation((ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    });
    const work = jest
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockRejectedValueOnce(new Error('3'))
      .mockResolvedValueOnce('ok');

    await retryWithBackoff(work, {
      retries: 5,
      baseDelayMs: 100,
      maxDelayMs: 250,
      sleep,
      random: () => 1, // worst case: no jitter reduction, full cap every time
    });

    // attempt 0 -> cap 100, attempt 1 -> cap 200, attempt 2 -> cap 250 (maxDelayMs)
    expect(delays).toEqual([100, 200, 250]);
  });
});
