import { describe, expect, it } from 'vitest';
import { Counter } from './limits.ts';

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
