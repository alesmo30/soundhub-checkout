import { TimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('resolves with the work result when it finishes before the timeout', async () => {
    const result = await withTimeout(() => Promise.resolve('ok'), 50);

    expect(result).toBe('ok');
  });

  it('rejects with TimeoutError when the work never settles', async () => {
    const work = () => new Promise<never>(() => {});

    await expect(withTimeout(work, 10)).rejects.toThrow(TimeoutError);
  });

  it('aborts the signal passed to work when the timeout elapses', async () => {
    let wasAborted = false;
    const work = (signal: AbortSignal) =>
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          wasAborted = true;
          reject(new Error('cancelled'));
        });
      });

    await expect(withTimeout(work, 10)).rejects.toThrow();
    expect(wasAborted).toBe(true);
  });

  it('propagates a rejection from work that happens before the timeout', async () => {
    const work = () => Promise.reject(new Error('boom'));

    await expect(withTimeout(work, 50)).rejects.toThrow('boom');
  });
});
