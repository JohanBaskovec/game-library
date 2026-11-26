import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** Asynchronous string storage: the same interface on the website and in the native app. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

function webStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Reading the property itself can throw (blocked site data, some file:// contexts).
    return undefined;
  }
}

/**
 * Browser storage that never throws. Values are also kept in memory, so the app keeps working,
 * without persistence, when storage is blocked or full (private windows, cleared site data).
 */
export function createWebStore(getStorage: () => Storage | undefined = webStorage): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    async get(key) {
      const cached = memory.get(key);
      if (cached !== undefined) return cached;
      try {
        const stored = getStorage()?.getItem(key) ?? null;
        if (stored !== null) memory.set(key, stored);
        return stored;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      memory.set(key, value);
      try {
        getStorage()?.setItem(key, value);
      } catch {
        // Kept in memory for this session only.
      }
    },
    async remove(key) {
      memory.delete(key);
      try {
        getStorage()?.removeItem(key);
      } catch {
        // Nothing to do.
      }
    },
  };
}

/** Native key-value store. Unlike web storage, the system does not clear it to free space. */
export function createNativeStore(): KeyValueStore {
  return {
    async get(key) {
      return (await Preferences.get({ key })).value;
    },
    async set(key, value) {
      await Preferences.set({ key, value });
    },
    async remove(key) {
      await Preferences.remove({ key });
    },
  };
}

export function createStorage(): KeyValueStore {
  return Capacitor.isNativePlatform() ? createNativeStore() : createWebStore();
}

/** Reads and writes JSON under a key prefix. Reads return untrusted data: callers must validate it. */
export interface JsonStore {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createJsonStore(store: KeyValueStore, prefix: string): JsonStore {
  return {
    async read(key) {
      const raw = await store.get(prefix + key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined;
      }
    },
    write(key, value) {
      return store.set(prefix + key, JSON.stringify(value));
    },
    remove(key) {
      return store.remove(prefix + key);
    },
  };
}
