/**
 * A token bucket: `capacity` actions can happen at once, and one more is allowed every
 * `1 / refillPerSecond` seconds. The hosts use it to limit messages per connection and requests per
 * address. It reads no clock: the caller passes the time.
 */
export interface RateLimiter {
  /** Takes one token if there is one. */
  allow(now: number): boolean;
}

export function createRateLimiter(options: {
  readonly capacity: number;
  readonly refillPerSecond: number;
}): RateLimiter {
  let tokens = options.capacity;
  let last: number | null = null;
  return {
    allow(now) {
      if (last !== null && now > last) {
        tokens = Math.min(
          options.capacity,
          tokens + ((now - last) / 1000) * options.refillPerSecond,
        );
      }
      if (last === null || now > last) last = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}
