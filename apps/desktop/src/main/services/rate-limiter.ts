export interface RateLimiterOptions<T = string> {
  max: number;
  windowMs: number;
  keyer?: (input: T) => string;
}

export class RateLimiter<T = string> {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly keyer?: (input: T) => string;
  private readonly buckets = new Map<string, number[]>();

  constructor(options: RateLimiterOptions<T>) {
    this.max = Math.max(1, options.max);
    this.windowMs = Math.max(1, options.windowMs);
    this.keyer = options.keyer;
  }

  keyOf(input: T): string {
    if (this.keyer) return this.keyer(input);
    return String(input);
  }

  check(key: string): boolean {
    const now = Date.now();
    const history = this.prune(key, now);
    return history.length < this.max;
  }

  touch(key: string): void {
    const now = Date.now();
    const history = this.prune(key, now);
    history.push(now);
    this.buckets.set(key, history);
  }

  private prune(key: string, now: number): number[] {
    const history = this.buckets.get(key) ?? [];
    const next = history.filter((timestamp) => now - timestamp < this.windowMs);
    if (next.length === 0) {
      this.buckets.delete(key);
    } else {
      this.buckets.set(key, next);
    }
    return next;
  }
}
