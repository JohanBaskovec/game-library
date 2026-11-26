import { describe, expect, it } from 'vitest';
import { Counter, KeyedLimiter } from './limits.ts';

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

describe('counter', () => {
  it('counts up and down, never below zero, and forgets keys at zero', () => {
    const counter = new Counter();
    counter.increment('a');
    counter.increment('a');
    expect(counter.get('a')).toBe(2);
    counter.decrement('a');
    counter.decrement('a');
    counter.decrement('a');
    expect(counter.get('a')).toBe(0);
    expect(counter.size).toBe(0);
    expect(counter.get('never')).toBe(0);
  });
});
