export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  work: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    retries,
    baseDelayMs,
    maxDelayMs,
    shouldRetry = () => true,
    random = Math.random,
    sleep = defaultSleep,
  } = options;

  let attempt = 0;

  // Loops until `work()` succeeds (return) or retries are exhausted (throw).
  for (;;) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }

      // Full jitter: sleep a random duration between 0 and the capped
      // exponential delay, so retrying clients don't all wake up at once.
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(cap * random());
      attempt += 1;
    }
  }
}
