import { describe, expect, it } from 'vitest';
import { createQr } from './qr.ts';

/** Reads the dark modules back out of the path. */
function modules(path: string, size: number): boolean[][] {
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const match of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const row = grid[Number(match[2])];
    if (row) row[Number(match[1])] = true;
  }
  return grid;
}

/** The 7 × 7 pattern in three corners of every QR code. */
const FINDER = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];

function patternAt(grid: boolean[][], top: number, left: number): string[] {
  return FINDER.map((_, r) =>
    (grid[top + r] ?? [])
      .slice(left, left + 7)
      .map((dark) => (dark ? '1' : '0'))
      .join(''),
  );
}

describe('QR codes', () => {
  const link = 'https://games.example/#/room/K7M2P';
  const qr = createQr(link);

  it('are drawn for a link', () => {
    expect(qr).not.toBeNull();
    expect((qr?.size ?? 0) >= 21 && ((qr?.size ?? 0) - 17) % 4 === 0).toBe(true);
    expect(qr?.path.length).toBeGreaterThan(100);
  });

  it('have the three finder patterns every reader looks for', () => {
    const size = qr?.size ?? 0;
    const grid = modules(qr?.path ?? '', size);
    expect(patternAt(grid, 0, 0)).toEqual(FINDER);
    expect(patternAt(grid, 0, size - 7)).toEqual(FINDER);
    expect(patternAt(grid, size - 7, 0)).toEqual(FINDER);
  });

  it('are the same for the same text and different for another', () => {
    expect(createQr(link)).toEqual(qr);
    expect(createQr('https://games.example/#/room/ABCDE')?.path).not.toBe(qr?.path);
  });

  it('use only the path commands the page draws', () => {
    expect(qr?.path).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
  });

  it('are not drawn for text too long to fit, rather than failing', () => {
    expect(createQr('x'.repeat(5000))).toBeNull();
  });
});
