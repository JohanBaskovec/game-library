import { describe, expect, it } from 'vitest';
import type { JsonStore } from '../services/storage.ts';
import { createFakeLogic } from './fake-game.ts';
import { ENVELOPE_FORMAT, clearSave, loadConfig, loadSave, saveConfig, saveGame } from './saves.ts';

const logic = createFakeLogic([
  { seat: 0, secret: true },
  { seat: 1, secret: false },
  { seat: 1, secret: false },
]);

function memoryJsonStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const store: JsonStore = {
    read: async (key) => data.get(key),
    write: async (key, value) => void data.set(key, JSON.parse(JSON.stringify(value))),
    remove: async (key) => void data.delete(key),
  };
  return { store, data };
}

describe('saved games', () => {
  it('saves and loads a game in progress', async () => {
    const { store } = memoryJsonStore();
    await saveGame(store, logic, { step: 1 });
    expect(await loadSave(store, logic)).toEqual({ step: 1 });
  });

  it('keeps the game id, versions and envelope format with the state', async () => {
    const { store, data } = memoryJsonStore();
    await saveGame(store, logic, { step: 1 });
    expect(data.get('game.fake.save')).toEqual({
      envelope: ENVELOPE_FORMAT,
      gameId: 'fake',
      rulesVersion: 3,
      saveFormat: 2,
      state: { step: 1 },
    });
  });

  it('has nothing to load when nothing was saved, or after clearing', async () => {
    const { store } = memoryJsonStore();
    expect(await loadSave(store, logic)).toBeNull();
    await saveGame(store, logic, { step: 1 });
    await clearSave(store, 'fake');
    expect(await loadSave(store, logic)).toBeNull();
  });

  it('ignores a save made with other rules or another state format', async () => {
    const valid = {
      envelope: ENVELOPE_FORMAT,
      gameId: 'fake',
      rulesVersion: 3,
      saveFormat: 2,
      state: { step: 1 },
    };
    for (const change of [
      { rulesVersion: 2 },
      { saveFormat: 1 },
      { gameId: 'other' },
      { envelope: 99 },
    ]) {
      const { store } = memoryJsonStore({ 'game.fake.save': { ...valid, ...change } });
      expect(await loadSave(store, logic)).toBeNull();
    }
    const { store } = memoryJsonStore({ 'game.fake.save': valid });
    expect(await loadSave(store, logic)).toEqual({ step: 1 });
  });

  it('ignores a save whose state fails the game’s own check', async () => {
    const envelope = { envelope: ENVELOPE_FORMAT, gameId: 'fake', rulesVersion: 3, saveFormat: 2 };
    for (const state of [{ step: 99 }, { step: -1 }, { step: 'x' }, null, 'junk']) {
      const { store } = memoryJsonStore({ 'game.fake.save': { ...envelope, state } });
      expect(await loadSave(store, logic)).toBeNull();
    }
  });

  it('ignores data that is not an envelope', async () => {
    for (const raw of ['text', 42, null, [], undefined]) {
      const { store } = memoryJsonStore({ 'game.fake.save': raw });
      expect(await loadSave(store, logic)).toBeNull();
    }
  });

  it('keeps going when storage fails', async () => {
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
    await expect(saveGame(failing, logic, { step: 0 })).resolves.toBeUndefined();
    await expect(clearSave(failing, 'fake')).resolves.toBeUndefined();
    await expect(saveConfig(failing, 'fake', {})).resolves.toBeUndefined();
    expect(await loadSave(failing, logic)).toBeNull();
    expect(await loadConfig(failing, logic)).toBeNull();
  });
});

describe('remembered settings', () => {
  it('are stored per game', async () => {
    const { store, data } = memoryJsonStore();
    await saveConfig(store, 'fake', { rounds: 3 });
    expect(data.get('game.fake.config')).toEqual({ rounds: 3 });
  });

  it('go through the game’s own checks when read back', async () => {
    const strict = {
      ...logic,
      normalizeConfig: (input: unknown) => ({ cleaned: input }),
      validateConfig: (config: { cleaned: unknown }) => (config.cleaned === 'good' ? null : 'bad'),
    };
    const { store } = memoryJsonStore({ 'game.fake.config': 'good' });
    expect(await loadConfig(store, strict as never)).toEqual({ cleaned: 'good' });
    const { store: other } = memoryJsonStore({ 'game.fake.config': 'evil' });
    expect(await loadConfig(other, strict as never)).toBeNull();
  });
});
