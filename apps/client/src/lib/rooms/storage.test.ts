import { describe, expect, it } from 'vitest';
import type { JsonStore } from '../services/storage.ts';
import { forgetRoom, loadPlayerName, recallRoom, rememberRoom, savePlayerName } from './storage.ts';

function memoryStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const store: JsonStore = {
    read: async (key) => data.get(key),
    write: async (key, value) => void data.set(key, JSON.parse(JSON.stringify(value))),
    remove: async (key) => void data.delete(key),
  };
  return { store, data };
}

describe('remembered rooms', () => {
  it('keep the token and name per room', async () => {
    const { store, data } = memoryStore();
    await rememberRoom(store, 'K7M2P', { token: 'abc', name: 'Ann' });
    expect(data.get('room.K7M2P')).toEqual({ token: 'abc', name: 'Ann' });
    expect(await recallRoom(store, 'K7M2P')).toEqual({ token: 'abc', name: 'Ann' });
    expect(await recallRoom(store, 'OTHER')).toBeNull();
  });

  it('are forgotten on request', async () => {
    const { store } = memoryStore();
    await rememberRoom(store, 'K7M2P', { token: 'abc', name: 'Ann' });
    await forgetRoom(store, 'K7M2P');
    expect(await recallRoom(store, 'K7M2P')).toBeNull();
  });

  it('are ignored when the stored data is not what was saved', async () => {
    for (const raw of [
      'text',
      42,
      null,
      [],
      {},
      { token: '', name: 'A' },
      { token: 'x' },
      { token: 3, name: 'A' },
    ]) {
      const { store } = memoryStore({ 'room.K7M2P': raw });
      expect(await recallRoom(store, 'K7M2P'), JSON.stringify(raw)).toBeNull();
    }
  });

  it('survive a store that fails', async () => {
    const failing: JsonStore = {
      read: async () => {
        throw new Error('blocked');
      },
      write: async () => {
        throw new Error('full');
      },
      remove: async () => {
        throw new Error('blocked');
      },
    };
    await expect(
      rememberRoom(failing, 'K7M2P', { token: 't', name: 'n' }),
    ).resolves.toBeUndefined();
    await expect(forgetRoom(failing, 'K7M2P')).resolves.toBeUndefined();
    await expect(savePlayerName(failing, 'Ann')).resolves.toBeUndefined();
    expect(await recallRoom(failing, 'K7M2P')).toBeNull();
    expect(await loadPlayerName(failing)).toBe('');
  });
});

describe('the player’s name', () => {
  it('is remembered, and empty when there is none', async () => {
    const { store } = memoryStore();
    expect(await loadPlayerName(store)).toBe('');
    await savePlayerName(store, 'Ann');
    expect(await loadPlayerName(store)).toBe('Ann');
  });

  it('is ignored when what was stored is not text', async () => {
    const { store } = memoryStore({ 'player.name': 42 });
    expect(await loadPlayerName(store)).toBe('');
  });
});
