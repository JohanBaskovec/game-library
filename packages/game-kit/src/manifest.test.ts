import { describe, expect, it } from 'vitest';
import { isLocale } from './locale.ts';
import { isValidGameId } from './manifest.ts';

describe('game ids', () => {
  it('accepts lowercase kebab-case', () => {
    for (const id of ['le-curseur', 'un-banger', 'forest-maze', 'chess', 'game2']) {
      expect(isValidGameId(id)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const id of ['', 'Le-Curseur', 'le_curseur', '-a', 'a-', 'a--b', '1game', 'a b']) {
      expect(isValidGameId(id)).toBe(false);
    }
  });
});

describe('locales', () => {
  it('recognises the supported languages only', () => {
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
