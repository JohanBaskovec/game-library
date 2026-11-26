import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './ratelimit.ts';

describe('rate limiter', () => {
  it('allows a burst up to its capacity, then refuses', () => {
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1 });
    expect([0, 0, 0, 0, 0].map(() => limiter.allow(1000))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('allows one more action for each second that passes', () => {
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 1 });
    limiter.allow(0);
    limiter.allow(0);
    expect(limiter.allow(500)).toBe(false);
    expect(limiter.allow(1000)).toBe(true);
    expect(limiter.allow(1000)).toBe(false);
    expect(limiter.allow(3000)).toBe(true);
  });

  it('never stores more than its capacity, however long it rests', () => {
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 10 });
    limiter.allow(0);
    expect([1e9, 1e9, 1e9].map((now) => limiter.allow(now))).toEqual([true, true, false]);
  });

  it('is not fooled by a clock that goes backwards', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1 });
    expect(limiter.allow(10_000)).toBe(true);
    expect(limiter.allow(0)).toBe(false);
    expect(limiter.allow(5000)).toBe(false);
    expect(limiter.allow(11_000)).toBe(true);
  });

  it('keeps separate limiters apart', () => {
    const a = createRateLimiter({ capacity: 1, refillPerSecond: 0.001 });
    const b = createRateLimiter({ capacity: 1, refillPerSecond: 0.001 });
    expect(a.allow(0)).toBe(true);
    expect(a.allow(0)).toBe(false);
    expect(b.allow(0)).toBe(true);
  });
});
