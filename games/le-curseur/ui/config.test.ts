import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en.ts';
import { fr } from '../i18n/fr.ts';
import { defaultConfig, startingConfig } from './config.ts';
import type { T } from './types.ts';

const tEn: T = (key) => en[key];
const tFr: T = (key) => fr[key];

describe('starting settings', () => {
  it('have team names in the language of the interface', () => {
    expect(defaultConfig(tEn).teamNames).toEqual(['The Blues', 'The Oranges']);
    expect(defaultConfig(tFr).teamNames).toEqual(['Les Bleus', 'Les Oranges']);
    expect(defaultConfig(tEn).roundCount).toBe(5);
    expect(defaultConfig(tEn).contentLocale).toBe('fr');
  });

  it('are the defaults when nothing was saved', () => {
    expect(startingConfig(null, tEn)).toEqual(defaultConfig(tEn));
  });

  it('are the last settings used, kept as they were', () => {
    const saved = { teamNames: ['Reds', 'Greens'], roundCount: 3, contentLocale: 'fr' } as const;
    expect(startingConfig(saved, tEn)).toEqual(saved);
  });

  it('replace an empty saved name by the default one', () => {
    const saved = { teamNames: ['', 'Greens'], roundCount: 3, contentLocale: 'fr' } as const;
    expect(startingConfig(saved, tFr).teamNames).toEqual(['Les Bleus', 'Greens']);
  });
});
