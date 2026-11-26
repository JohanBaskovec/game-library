import { LOCALES } from '@game-library/game-kit';
import { describe, expect, it } from 'vitest';
import {
  catalogs,
  detectLocale,
  format,
  placeholders,
  translate,
  type MessageKey,
} from './core.ts';
import { en } from './en.ts';

const keys = Object.keys(en) as MessageKey[];

describe('catalogs', () => {
  it('has a catalog for every supported language', () => {
    expect(Object.keys(catalogs).sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)('%s provides exactly the same keys as English', (locale) => {
    expect(Object.keys(catalogs[locale]).sort()).toEqual([...keys].sort());
  });

  it.each(LOCALES)('%s has no empty message', (locale) => {
    for (const key of keys) expect(catalogs[locale][key].trim(), key).not.toBe('');
  });

  it('uses the same placeholders in every language', () => {
    for (const key of keys) {
      for (const locale of LOCALES) {
        expect(placeholders(catalogs[locale][key]), `${locale} ${key}`).toEqual(
          placeholders(en[key]),
        );
      }
    }
  });

  it('follows French typography: a non-breaking space before : ; ! ? and « » spaced', () => {
    for (const key of keys) {
      const text = catalogs.fr[key];
      expect(text, key).not.toMatch(/ [:;!?]/);
      expect(text, key).not.toMatch(/\u00AB[^\u00A0\u202F]|[^\u00A0\u202F]\u00BB/);
    }
  });
});

describe('format', () => {
  it('fills placeholders, numbers included', () => {
    expect(format('Version {version}', { version: '1.2' })).toBe('Version 1.2');
    expect(format('{count} / {total}', { count: 3, total: 10 })).toBe('3 / 10');
  });

  it('leaves a placeholder without a value visible', () => {
    expect(format('Hello {name}')).toBe('Hello {name}');
    expect(format('Hello {name}', { other: 'x' })).toBe('Hello {name}');
  });

  it('fills a value of 0', () => {
    expect(format('{n} left', { n: 0 })).toBe('0 left');
  });
});

describe('translate', () => {
  it('returns the message of the requested language', () => {
    expect(translate('en', 'nav.settings')).toBe('Settings');
    expect(translate('fr', 'nav.settings')).toBe('Réglages');
  });

  it('applies parameters', () => {
    expect(translate('fr', 'settings.version', { version: '9' })).toBe('Version 9');
  });
});

describe('detectLocale', () => {
  it('picks the first supported language, ignoring the region', () => {
    expect(detectLocale(['fr-CA', 'en-US'])).toBe('fr');
    expect(detectLocale(['de-DE', 'en-GB', 'fr'])).toBe('en');
    expect(detectLocale(['FR'])).toBe('fr');
  });

  it('falls back to English when nothing is supported or the list is empty', () => {
    expect(detectLocale(['de-DE', 'ja'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});
