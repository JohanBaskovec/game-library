import { describe, expect, it } from 'vitest';
import { KeyedLimiter, createRateLimiter, fullBucket, takeFromBucket } from './ratelimit.ts';

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

describe('keyed limiter', () => {
  it('limits each key on its own', () => {
    const limiter = new KeyedLimiter({ capacity: 2, refillPerSecond: 0.001 });
    expect([limiter.allow('a', 0), limiter.allow('a', 0), limiter.allow('a', 0)]).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiter.allow('b', 0)).toBe(true);
  });

  it('forgets the least recently used keys, so memory stays bounded', () => {
    const limiter = new KeyedLimiter({ capacity: 1, refillPerSecond: 0.001, maxKeys: 3 });
    for (const key of ['a', 'b', 'c']) limiter.allow(key, 0);
    limiter.allow('a', 0); // a is now the most recently used
    limiter.allow('d', 0); // b, the oldest, is forgotten
    expect(limiter.size).toBe(3);
    expect(limiter.allow('b', 0)).toBe(true); // forgotten: starts afresh
    expect(limiter.allow('a', 0)).toBe(false); // kept: still limited
  });
});

describe('token bucket as data', () => {
  const options = { capacity: 3, refillPerSecond: 1 };

  it('takes a token and returns the bucket to keep, which survives JSON', () => {
    let bucket = fullBucket(options);
    const taken: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const result = takeFromBucket(bucket, 1000, options);
      taken.push(result.allowed);
      bucket = JSON.parse(JSON.stringify(result.bucket));
    }
    expect(taken).toEqual([true, true, true, false]);
    expect(takeFromBucket(bucket, 2000, options).allowed).toBe(true);
  });

  it('only looks when the cost is zero, and still refuses an empty bucket', () => {
    const empty = { tokens: 0, last: 0 };
    expect(takeFromBucket(empty, 0, options, 0).allowed).toBe(false);
    const full = fullBucket(options);
    const peek = takeFromBucket(full, 0, options, 0);
    expect(peek.allowed).toBe(true);
    expect(peek.bucket.tokens).toBe(3);
  });
});
