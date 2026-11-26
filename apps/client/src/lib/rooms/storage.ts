import type { JsonStore } from '../services/storage.ts';

/** What a device keeps about a room it joined, so that it can come back to it (CLAUDE.md: reconnect token). */
export interface RoomMembership {
  readonly token: string;
  readonly name: string;
}

const roomKey = (code: string): string => `room.${code}`;
const NAME_KEY = 'player.name';

export async function recallRoom(store: JsonStore, code: string): Promise<RoomMembership | null> {
  const raw = await store.read(roomKey(code)).catch(() => undefined);
  if (typeof raw !== 'object' || raw === null) return null;
  const { token, name } = raw as Record<string, unknown>;
  return typeof token === 'string' && token !== '' && typeof name === 'string'
    ? { token, name }
    : null;
}

export async function rememberRoom(
  store: JsonStore,
  code: string,
  membership: RoomMembership,
): Promise<void> {
  try {
    await store.write(roomKey(code), membership);
  } catch {
    // Storage is unavailable: the device can still play, but cannot come back after a reload.
  }
}

export async function forgetRoom(store: JsonStore, code: string): Promise<void> {
  try {
    await store.remove(roomKey(code));
  } catch {
    // Nothing to do.
  }
}

/** The name the player used last time, to fill the form in. */
export async function loadPlayerName(store: JsonStore): Promise<string> {
  const raw = await store.read(NAME_KEY).catch(() => undefined);
  return typeof raw === 'string' ? raw : '';
}

export async function savePlayerName(store: JsonStore, name: string): Promise<void> {
  try {
    await store.write(NAME_KEY, name);
  } catch {
    // Not remembering the name is harmless.
  }
}
