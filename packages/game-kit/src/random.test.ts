import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, seedRng, shuffle } from './random.ts';

function draw(seed: string, count: number): number[] {
  let state = seedRng(seed);
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const [value, next] = nextInt(state, 1000);
    values.push(value);
    state = next;
  }
  return values;
}

describe('seeded random', () => {
  it('gives the same draws for the same seed', () => {
    expect(draw('abc', 50)).toEqual(draw('abc', 50));
  });

  it('gives different draws for different seeds', () => {
    expect(draw('abc', 50)).not.toEqual(draw('abd', 50));
  });

  it('continues identically after the state goes through JSON', () => {
    const [, mid] = nextFloat(seedRng('save-and-restore'));
    const restored = JSON.parse(JSON.stringify(mid)) as typeof mid;
    expect(nextFloat(restored)).toEqual(nextFloat(mid));
  });

  it('does not mutate the state it is given', () => {
    const state = seedRng('immutable');
    const copy = { ...state };
    nextFloat(state);
    nextInt(state, 10);
    expect(state).toEqual(copy);
  });

  it('keeps floats in [0, 1) and integers in range, covering the range', () => {
    let state = seedRng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const [f, afterFloat] = nextFloat(state);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const [n, afterInt] = nextInt(afterFloat, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      seen.add(n);
      state = afterInt;
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('rejects ranges that are not positive integers', () => {
    const state = seedRng('bad');
    expect(() => nextInt(state, 0)).toThrow(RangeError);
    expect(() => nextInt(state, -3)).toThrow(RangeError);
    expect(() => nextInt(state, 2.5)).toThrow(RangeError);
  });

  it('shuffles into a permutation, deterministically, without touching the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const [a] = shuffle(input, seedRng('s'));
    const [b] = shuffle(input, seedRng('s'));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([...input]);
    expect(a).not.toEqual([...input]);
  });

  it('shuffles empty and single-item lists', () => {
    expect(shuffle([], seedRng('x'))[0]).toEqual([]);
    expect(shuffle(['only'], seedRng('x'))[0]).toEqual(['only']);
  });
});
