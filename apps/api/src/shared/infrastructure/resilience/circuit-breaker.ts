export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitOpenError';
  }
}

type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  openDurationMs: number;
  now?: () => number;
}

export class CircuitBreaker {
  private readonly now: () => number;
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private openedAt = 0;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  canRequest(): boolean {
    if (this.state === 'open' && this.now() - this.openedAt >= this.options.openDurationMs) {
      this.state = 'half-open';
    }

    return this.state !== 'open';
  }

  async execute<T>(work: () => Promise<T>): Promise<T> {
    if (!this.canRequest()) {
      throw new CircuitOpenError();
    }

    try {
      const result = await work();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.state = 'closed';
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount += 1;

    if (this.state === 'half-open' || this.failureCount >= this.options.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
      this.failureCount = 0;
    }
  }
}
