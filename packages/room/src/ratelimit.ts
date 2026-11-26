/**
 * A token bucket: `capacity` actions can happen at once, and one more is allowed every
 * `1 / refillPerSecond` seconds. The hosts use it to limit messages per connection and requests per
 * address. It reads no clock: the caller passes the time.
 */
export interface RateLimiter {
  /** Takes one token if there is one. */
  allow(now: number): boolean;
}

/** The state of a token bucket, as plain data that a host can keep in storage. */
export interface Bucket {
  readonly tokens: number;
  /** The time of the last update, or null before the first use. */
  readonly last: number | null;
}

export interface BucketOptions {
  readonly capacity: number;
  readonly refillPerSecond: number;
}

export const fullBucket = (options: BucketOptions): Bucket => ({
  tokens: options.capacity,
  last: null,
});

/**
 * Refills the bucket for the time that has passed, then takes `cost` tokens if there are enough (a cost of 0
 * only looks). Returns whether it was allowed and the bucket to keep. A clock that goes backwards adds nothing.
 */
export function takeFromBucket(
  bucket: Bucket,
  now: number,
  options: BucketOptions,
  cost = 1,
): { readonly allowed: boolean; readonly bucket: Bucket } {
  let tokens = bucket.tokens;
  let last = bucket.last;
  if (last !== null && now > last) {
    tokens = Math.min(options.capacity, tokens + ((now - last) / 1000) * options.refillPerSecond);
  }
  if (last === null || now > last) last = now;
  if (tokens < Math.max(1, cost)) return { allowed: false, bucket: { tokens, last } };
  return { allowed: true, bucket: { tokens: tokens - cost, last } };
}

export function createRateLimiter(options: BucketOptions): RateLimiter {
  let bucket = fullBucket(options);
  return {
    allow(now) {
      const result = takeFromBucket(bucket, now, options);
      bucket = result.bucket;
      return result.allowed;
    },
  };
}

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
