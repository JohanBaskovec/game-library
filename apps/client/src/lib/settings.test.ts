import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore, normalizeSettings } from './settings.svelte.ts';
import type { JsonStore } from './services/storage.ts';

function fakeJsonStore(initial?: unknown) {
  const written: unknown[] = [];
  const store: JsonStore = {
    read: async () => initial,
    write: async (_key, value) => void written.push(value),
    remove: async () => {},
  };
  return { store, written };
}

describe('normalizeSettings', () => {
  it('gives the defaults for missing or unusable data', () => {
    for (const input of [undefined, null, 'text', 42, [], {}]) {
      expect(normalizeSettings(input)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('keeps valid values', () => {
    expect(normalizeSettings({ language: 'fr', sound: false, vibration: false })).toEqual({
      language: 'fr',
      sound: false,
      vibration: false,
    });
    expect(normalizeSettings({ language: 'auto' }).language).toBe('auto');
  });

  it('replaces each invalid value by its default and ignores unknown fields', () => {
    expect(normalizeSettings({ language: 'de', sound: 'yes', vibration: 0, extra: 1 })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});

describe('settings store', () => {
  it('starts with the defaults', () => {
    expect(new SettingsStore(fakeJsonStore().store).value).toEqual(DEFAULT_SETTINGS);
  });

  it('loads saved settings', async () => {
    const settings = new SettingsStore(fakeJsonStore({ language: 'en', sound: false }).store);
    await settings.load();
    expect(settings.value).toEqual({ language: 'en', sound: false, vibration: true });
  });

  it('saves every change', () => {
    const { store, written } = fakeJsonStore();
    const settings = new SettingsStore(store);
    settings.set('language', 'fr');
    settings.set('sound', false);
    expect(settings.value).toEqual({ language: 'fr', sound: false, vibration: true });
    expect(written).toEqual([
      { language: 'fr', sound: true, vibration: true },
      { language: 'fr', sound: false, vibration: true },
    ]);
  });

  it('keeps the change in memory when saving fails', () => {
    const failing: JsonStore = {
      read: async () => undefined,
      write: async () => {
        throw new Error('disk full');
      },
      remove: async () => {},
    };
    const settings = new SettingsStore(failing);
    expect(() => settings.set('vibration', false)).not.toThrow();
    expect(settings.value.vibration).toBe(false);
  });
});
