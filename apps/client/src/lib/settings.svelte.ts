import { isLocale, type Locale } from '@game-library/game-kit';
import { json } from './services/index.ts';
import type { JsonStore } from './services/storage.ts';

export type LanguagePreference = 'auto' | Locale;

export interface Settings {
  language: LanguagePreference;
  sound: boolean;
  vibration: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  language: 'auto',
  sound: true,
  vibration: true,
};

const SETTINGS_KEY = 'settings';

/** Builds valid settings from stored data. Anything missing or invalid falls back to its default. */
export function normalizeSettings(input: unknown): Settings {
  const data =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const { language, sound, vibration } = data;
  return {
    language: language === 'auto' || isLocale(language) ? language : DEFAULT_SETTINGS.language,
    sound: typeof sound === 'boolean' ? sound : DEFAULT_SETTINGS.sound,
    vibration: typeof vibration === 'boolean' ? vibration : DEFAULT_SETTINGS.vibration,
  };
}

export class SettingsStore {
  value = $state<Settings>({ ...DEFAULT_SETTINGS });
  readonly #store: JsonStore;

  constructor(store: JsonStore) {
    this.#store = store;
  }

  async load(): Promise<void> {
    this.value = normalizeSettings(await this.#store.read(SETTINGS_KEY));
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.value = { ...this.value, [key]: value };
    void this.#store.write(SETTINGS_KEY, this.value).catch(() => {});
  }
}

export const settings = new SettingsStore(json);
