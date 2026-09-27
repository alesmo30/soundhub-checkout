export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new TimeoutError(ms)), { once: true });
  });

  try {
    return await Promise.race([work(controller.signal), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}
