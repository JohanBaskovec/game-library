import { describe, expect, it } from 'vitest';
import { bandNumbers, bandRects } from './bands.ts';

describe('band zones', () => {
  it('are centred on the target, widest first', () => {
    expect(bandRects(50)).toEqual([
      { left: 36, width: 28 },
      { left: 39.5, width: 21 },
      { left: 43, width: 14 },
      { left: 46.5, width: 7 },
    ]);
  });

  it('stop at the ends of the ruler', () => {
    expect(bandRects(0)[0]).toEqual({ left: 0, width: 14 });
    expect(bandRects(100)[0]).toEqual({ left: 86, width: 14 });
    for (const target of [0, 1, 50, 99, 100]) {
      for (const rect of bandRects(target)) {
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.left + rect.width).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('band numbers', () => {
  it('are written in the middle of each zone, on both sides of the target', () => {
    expect(bandNumbers(50)).toEqual([
      { left: 48.25, points: 4 },
      { left: 51.75, points: 4 },
      { left: 44.75, points: 3 },
      { left: 55.25, points: 3 },
      { left: 41.25, points: 2 },
      { left: 58.75, points: 2 },
      { left: 37.75, points: 1 },
      { left: 62.25, points: 1 },
    ]);
  });

  it('skip a zone cut too narrow by the end of the ruler', () => {
    const atEdge = bandNumbers(0);
    expect(atEdge.every((number) => number.left >= 0)).toBe(true);
    expect(atEdge.length).toBeLessThan(bandNumbers(50).length);
  });
});
