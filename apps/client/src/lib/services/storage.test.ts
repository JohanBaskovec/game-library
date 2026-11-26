import { describe, expect, it } from 'vitest';
import { createJsonStore, createWebStore, type KeyValueStore } from './storage.ts';

function fakeStorage(data = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  } as Storage;
}

function brokenStorage(): Storage {
  const fail = (): never => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return { getItem: fail, setItem: fail, removeItem: fail } as unknown as Storage;
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
}

describe('web store', () => {
  it('reads what it wrote, and persists to the browser storage', async () => {
    const data = new Map<string, string>();
    const store = createWebStore(() => fakeStorage(data));
    expect(await store.get('a')).toBeNull();
    await store.set('a', '1');
    expect(await store.get('a')).toBe('1');
    expect(data.get('a')).toBe('1');
  });

  it('reads values that were stored before', async () => {
    const store = createWebStore(() => fakeStorage(new Map([['old', 'x']])));
    expect(await store.get('old')).toBe('x');
  });

  it('removes values', async () => {
    const data = new Map([['a', '1']]);
    const store = createWebStore(() => fakeStorage(data));
    await store.get('a');
    await store.remove('a');
    expect(await store.get('a')).toBeNull();
    expect(data.has('a')).toBe(false);
  });

  it('keeps working in memory when storage throws on every call', async () => {
    const store = createWebStore(() => brokenStorage());
    expect(await store.get('a')).toBeNull();
    await store.set('a', '1');
    expect(await store.get('a')).toBe('1');
    await store.remove('a');
    expect(await store.get('a')).toBeNull();
  });

  it('keeps working when storage is not available at all', async () => {
    const store = createWebStore(() => undefined);
    await store.set('a', '1');
    expect(await store.get('a')).toBe('1');
  });

  it('keeps working when reading the storage object itself throws', async () => {
    const store = createWebStore(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    await store.set('a', '1');
    expect(await store.get('a')).toBe('1');
    expect(await store.get('missing')).toBeNull();
  });
});

describe('json store', () => {
  it('round-trips values under a prefix', async () => {
    const raw = memoryStore();
    const json = createJsonStore(raw, 'gl.');
    await json.write('settings', { language: 'fr', sound: false });
    expect(raw.data.get('gl.settings')).toBe('{"language":"fr","sound":false}');
    expect(await json.read('settings')).toEqual({ language: 'fr', sound: false });
  });

  it('returns undefined for a missing key', async () => {
    expect(await createJsonStore(memoryStore(), 'gl.').read('nothing')).toBeUndefined();
  });

  it('returns undefined, not an error, for stored text that is not JSON', async () => {
    const raw = memoryStore();
    raw.data.set('gl.settings', '{broken');
    expect(await createJsonStore(raw, 'gl.').read('settings')).toBeUndefined();
  });

  it('removes under the prefix only', async () => {
    const raw = memoryStore();
    raw.data.set('other', 'keep');
    const json = createJsonStore(raw, 'gl.');
    await json.write('a', 1);
    await json.remove('a');
    expect([...raw.data.keys()]).toEqual(['other']);
  });
});
