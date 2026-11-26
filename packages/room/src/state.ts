import type { ErasedGameLogic } from '@game-library/game-kit';
import type { RoomPhase } from './protocol.ts';

/** Version of the saved shape of a room. Bumped when `RoomState` changes. */
export const ROOM_FORMAT = 1;

/** A device (a phone, a browser) in the room. It keeps its identity across reconnections. */
export interface DeviceRecord {
  readonly id: string;
  /** Secret; whoever holds it is this device. Never sent to the other devices. */
  readonly token: string;
  name: string;
  seat: number | null;
  readonly joinedAt: number;
  /** When it was last seen: when it joined, or when its last connection closed. */
  lastSeen: number;
}

/** A socket. It exists only while the socket does, and is empty until the device says who it is. */
export interface Connection {
  deviceId: string | null;
  readonly since: number;
}

/**
 * A room, as plain data that survives JSON (CLAUDE.md rule 1): the hosts can keep it in memory or save it
 * between messages. It holds the game's state, so it is never sent to a device.
 */
export interface RoomState {
  readonly format: number;
  readonly code: string;
  readonly gameId: string;
  readonly rulesVersion: number;
  config: unknown;
  phase: RoomPhase;
  hostId: string;
  /** In order of arrival: the host passes to the earliest device that is still connected. */
  devices: DeviceRecord[];
  /** Open sockets, by an id the host chooses. Rebuilt by the host after a restart. */
  connections: Record<string, Connection>;
  /** The game's state while playing or finished, otherwise null. */
  game: unknown;
  readonly createdAt: number;
  lastActivityAt: number;
  /** Counts changes, so devices can ignore a message that arrives out of order. */
  version: number;
}

/** What the engine needs to know about the games it can run. */
export interface RoomEnv {
  game(id: string): ErasedGameLogic | undefined;
}
