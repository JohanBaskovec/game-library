import type { BaseView, GameLogic } from '@game-library/game-kit';
import type { JsonStore } from '../services/storage.ts';

/** Version of the saved envelope itself (not of a game's state, which has its own `saveFormat`). */
export const ENVELOPE_FORMAT = 1;

const saveKey = (gameId: string): string => `game.${gameId}.save`;
const configKey = (gameId: string): string => `game.${gameId}.config`;

interface Envelope {
  envelope: number;
  gameId: string;
  rulesVersion: number;
  saveFormat: number;
  state: unknown;
}

type AnyLogic = GameLogic<unknown, unknown, BaseView>;

/** Saves a game in progress. A failure to save never interrupts the game. */
export async function saveGame(store: JsonStore, logic: AnyLogic, state: unknown): Promise<void> {
  const envelope: Envelope = {
    envelope: ENVELOPE_FORMAT,
    gameId: logic.id,
    rulesVersion: logic.rulesVersion,
    saveFormat: logic.saveFormat,
    state,
  };
  try {
    await store.write(saveKey(logic.id), envelope);
  } catch {
    // Storage is unavailable: the game goes on without being resumable.
  }
}

export async function clearSave(store: JsonStore, gameId: string): Promise<void> {
  try {
    await store.remove(saveKey(gameId));
  } catch {
    // Nothing to do.
  }
}

/**
 * The saved game, if there is one that this version of the game can continue: same envelope, game,
 * rules version and state format, and a state that passes the game's own check. Anything else is
 * ignored, so an update can never load a game that no longer fits.
 */
export async function loadSave(store: JsonStore, logic: AnyLogic): Promise<unknown | null> {
  const raw = await store.read(saveKey(logic.id)).catch(() => undefined);
  if (typeof raw !== 'object' || raw === null) return null;
  const envelope = raw as Partial<Envelope>;
  if (
    envelope.envelope !== ENVELOPE_FORMAT ||
    envelope.gameId !== logic.id ||
    envelope.rulesVersion !== logic.rulesVersion ||
    envelope.saveFormat !== logic.saveFormat
  ) {
    return null;
  }
  return logic.restore(envelope.state);
}

/** The settings used last time, so the menu is filled in again. Always checked by the game. */
export async function loadConfig(store: JsonStore, logic: AnyLogic): Promise<unknown> {
  const raw = await store.read(configKey(logic.id)).catch(() => undefined);
  const config = logic.normalizeConfig(raw);
  return logic.validateConfig(config) === null ? config : null;
}

export async function saveConfig(store: JsonStore, gameId: string, config: unknown): Promise<void> {
  try {
    await store.write(configKey(gameId), config);
  } catch {
    // Not remembering the settings is harmless.
  }
}
