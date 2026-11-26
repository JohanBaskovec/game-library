import { LOCALES } from '@game-library/game-kit';
import { describe, expect, it } from 'vitest';
import { messages, type GameKey } from './index.ts';
import { en } from './en.ts';

const keys = Object.keys(en) as GameKey[];
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('Le Curseur messages', () => {
  it.each(LOCALES)('%s has exactly the same keys as English', (locale) => {
    expect(Object.keys(messages[locale]).sort()).toEqual([...keys].sort());
  });

  it.each(LOCALES)('%s has no empty message', (locale) => {
    for (const key of keys) expect(messages[locale][key].trim(), key).not.toBe('');
  });

  it('uses the same placeholders in both languages', () => {
    for (const key of keys) {
      expect(placeholders(messages.fr[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('follows French typography: non-breaking space before : ; ! ? and %', () => {
    for (const key of keys) {
      expect(messages.fr[key], key).not.toMatch(/ [:;!?%]/);
      expect(messages.fr[key], key).not.toMatch(/\u00AB[^\u00A0]|[^\u00A0]\u00BB/);
    }
  });

  it('has a message for every error the game can report', () => {
    for (const code of ['empty-name', 'same-name', 'bad-rounds', 'no-content']) {
      expect(keys).toContain(`menu.error.${code}`);
    }
  });
});
