import { describe, expect, it } from 'vitest';
import { needsHandoff } from './handoff.ts';

const screen = (seat: number, secret: boolean) => ({ seat, secret });

describe('needsHandoff', () => {
  it('is always needed at the start of a game and after a resume', () => {
    expect(needsHandoff(null, screen(0, false))).toBe(true);
    expect(needsHandoff(null, screen(1, true))).toBe(true);
  });

  it('is needed when the phone must change hands', () => {
    expect(needsHandoff(screen(0, true), screen(1, false))).toBe(true);
    expect(needsHandoff(screen(0, false), screen(1, false))).toBe(true);
    expect(needsHandoff(screen(1, true), screen(0, true))).toBe(true);
  });

  it('is needed before a secret that follows a screen everyone could see', () => {
    // The result is shown, then the same team gets the next secret target.
    expect(needsHandoff(screen(1, false), screen(1, true))).toBe(true);
  });

  it('is not needed while the same seat stays on a secret screen', () => {
    expect(needsHandoff(screen(0, true), screen(0, true))).toBe(false);
  });

  it('is not needed between two open screens of the same seat', () => {
    expect(needsHandoff(screen(1, false), screen(1, false))).toBe(false);
  });

  it('is not needed when a secret screen is followed by an open one for the same seat', () => {
    expect(needsHandoff(screen(0, true), screen(0, false))).toBe(false);
  });
});
