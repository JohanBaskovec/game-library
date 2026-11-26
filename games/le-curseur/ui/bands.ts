import { POSITION_MAX, POSITION_MIN, SCORE_BANDS } from '../logic/index.ts';

export interface BandRect {
  /** Left edge and width, in percent of the ruler. */
  readonly left: number;
  readonly width: number;
}

export interface BandNumber {
  /** Centre of the number, in percent of the ruler. */
  readonly left: number;
  readonly points: number;
}

const clamp = (value: number): number => Math.min(POSITION_MAX, Math.max(POSITION_MIN, value));

/** Zones centred on the target, widest first so that the closer ones are drawn on top and look darker. */
export function bandRects(target: number): BandRect[] {
  return [...SCORE_BANDS].reverse().map((band) => {
    const left = clamp(target - band.max);
    const right = clamp(target + band.max);
    return { left, width: right - left };
  });
}

/** Where to write the points of each zone, on both sides of the target; zones too narrow to read are skipped. */
export function bandNumbers(target: number): BandNumber[] {
  const numbers: BandNumber[] = [];
  SCORE_BANDS.forEach((band, i) => {
    const inner = SCORE_BANDS[i - 1]?.max ?? 0;
    for (const side of [-1, 1]) {
      const a = clamp(target + side * inner);
      const b = clamp(target + side * band.max);
      if (Math.abs(b - a) < 3) continue;
      numbers.push({ left: (a + b) / 2, points: band.points });
    }
  });
  return numbers;
}
