import { describe, expect, it } from 'vitest';
import { messages } from '../i18n/index.ts';
import type { GameKey } from '../i18n/index.ts';
import { distanceText, pointsText, scoreLine, totalText } from './format.ts';
import type { T } from './types.ts';

function translator(locale: 'fr' | 'en'): T {
  return (key: GameKey, params = {}) =>
    messages[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));
}

describe('texts of the game', () => {
  it('shows the score with the plural of the language', () => {
    const nbsp = '\u00A0';
    expect(scoreLine(translator('fr'), 'fr', 0)).toBe(`Score commun${nbsp}: 0 point`);
    expect(scoreLine(translator('fr'), 'fr', 1)).toBe(`Score commun${nbsp}: 1 point`);
    expect(scoreLine(translator('fr'), 'fr', 2)).toBe(`Score commun${nbsp}: 2 points`);
    expect(scoreLine(translator('en'), 'en', 0)).toBe('Shared score: 0 points');
    expect(scoreLine(translator('en'), 'en', 1)).toBe('Shared score: 1 point');
    expect(scoreLine(translator('en'), 'en', 12)).toBe('Shared score: 12 points');
  });

  it('shows the total in the recap', () => {
    expect(totalText(translator('fr'), 'fr', 1)).toBe('1 pt');
    expect(totalText(translator('fr'), 'fr', 7)).toBe('7 pts');
    expect(totalText(translator('en'), 'en', 0)).toBe('0 pts');
  });

  it('shows the points of a turn', () => {
    expect(pointsText(translator('en'), 0)).toBe('0 points');
    expect(pointsText(translator('en'), 1)).toBe('+1 point');
    expect(pointsText(translator('en'), 4)).toBe('+4 points');
    expect(pointsText(translator('fr'), 0)).toBe('0 point');
  });

  it('shows the distance, with a bullseye for an exact answer', () => {
    expect(distanceText(translator('en'), 0)).toBe('Bullseye!');
    expect(distanceText(translator('en'), 5)).toBe('Off by 5%');
    expect(distanceText(translator('fr'), 5)).toBe('Écart de 5\u00A0%');
  });
});
