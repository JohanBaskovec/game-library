/**
 * Seeded, serializable, purely functional random numbers (CLAUDE.md rule 1).
 *
 * The generator state is a plain object kept inside the game state, so a saved or moved game
 * continues with exactly the same draws. Every function returns the next state; nothing is mutated.
 *
 * Games ported from the standalone versions that already have their own generator and draw order
 * (Un Banger, Forest Maze) keep it: a port must not change the order of random draws.
 */
export interface RngState {
  readonly s: number;
}

const UINT32_RANGE = 4294967296;

/** FNV-1a, 32 bits: turns a text seed into a starting state. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seedRng(seed: string): RngState {
  return { s: hashSeed(seed) };
}

/** Mulberry32 step. Returns an unsigned 32-bit integer and the next state. */
function nextUint32(state: RngState): [number, RngState] {
  const s = (state.s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, { s }];
}

/** A float in [0, 1). */
export function nextFloat(state: RngState): [number, RngState] {
  const [u, next] = nextUint32(state);
  return [u / UINT32_RANGE, next];
}

/** An integer in [0, maxExclusive). The bias is negligible for the ranges games use. */
export function nextInt(state: RngState, maxExclusive: number): [number, RngState] {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  const [f, next] = nextFloat(state);
  return [Math.floor(f * maxExclusive), next];
}

/** Fisher-Yates shuffle. Returns a new array; the input is left untouched. */
export function shuffle<T>(items: readonly T[], state: RngState): [T[], RngState] {
  const result = [...items];
  let current = state;
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = nextInt(current, i + 1);
    current = next;
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return [result, current];
}
