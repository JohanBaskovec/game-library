import { createRateLimiter, type RateLimiter } from '@game-library/room';

/** Rate limits by key (an address, say), forgetting the least recently used keys so memory stays bounded. */
export class KeyedLimiter {
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly maxKeys: number;
  private readonly limiters = new Map<string, RateLimiter>();

  constructor(options: { capacity: number; refillPerSecond: number; maxKeys?: number }) {
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  allow(key: string, now: number): boolean {
    let limiter = this.limiters.get(key);
    if (limiter) {
      this.limiters.delete(key); // Move it to the end: most recently used.
    } else {
      limiter = createRateLimiter({
        capacity: this.capacity,
        refillPerSecond: this.refillPerSecond,
      });
      if (this.limiters.size >= this.maxKeys) {
        const oldest = this.limiters.keys().next().value;
        if (oldest !== undefined) this.limiters.delete(oldest);
      }
    }
    this.limiters.set(key, limiter);
    return limiter.allow(now);
  }

  get size(): number {
    return this.limiters.size;
  }
}

/** Counts of open things per key (sockets per address), never below zero. */
export class Counter {
  private readonly counts = new Map<string, number>();

  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  increment(key: string): void {
    this.counts.set(key, this.get(key) + 1);
  }

  decrement(key: string): void {
    const next = this.get(key) - 1;
    if (next <= 0) this.counts.delete(key);
    else this.counts.set(key, next);
  }

  get size(): number {
    return this.counts.size;
  }
}
