import { DEFAULT_LOCALE, isLocale, type Locale } from '@game-library/game-kit';
import { en, type MessageKey } from './en.ts';
import { fr } from './fr.ts';

export type { MessageKey } from './en.ts';
export type MessageParams = Readonly<Record<string, string | number>>;

export const catalogs: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en, fr };

/** Fills `{name}` placeholders. A placeholder without a value is left visible, never dropped. */
export function format(template: string, params?: MessageParams): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params?.[name];
    return value === undefined ? placeholder : String(value);
  });
}

/** Names of the `{placeholders}` of a message. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort();
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  return format(catalogs[locale][key], params);
}

/** The first supported language of the device's list, e.g. ["de-DE", "fr-CA"] gives "fr". */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** A translate function for a game's own messages, bound to the language `locale()` returns. */
export function createTranslator(
  catalogs: Readonly<Record<Locale, Readonly<Record<string, string>>>>,
  locale: () => Locale,
): (key: string, params?: MessageParams) => string {
  return (key, params) => {
    const template = catalogs[locale()][key];
    // A missing key is a bug in the game's messages; showing the key makes it visible, never blank.
    return template === undefined ? key : format(template, params);
  };
}
