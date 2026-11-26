import type { Locale } from '@game-library/game-kit';
import { detectLocale, translate, type MessageKey, type MessageParams } from './i18n/core.ts';
import { settings } from './settings.svelte.ts';

const deviceLocale = detectLocale(globalThis.navigator?.languages ?? []);

/** The language in use: the player's choice, or the device language when set to automatic. */
export function currentLocale(): Locale {
  const choice = settings.value.language;
  return choice === 'auto' ? deviceLocale : choice;
}

/** Reads the setting, so interface text updates when the language changes. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(currentLocale(), key, params);
}
