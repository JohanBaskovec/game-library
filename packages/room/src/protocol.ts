/** Version of the messages and of the HTTP API. Bumped whenever either changes (CLAUDE.md rule 9). */
export const PROTOCOL_VERSION = 1;

/** Limits that protect a room. The hosts enforce the byte and rate limits; the engine the rest. */
export const LIMITS = {
  maxNameLength: 20,
  maxDevices: 12,
  /** Largest message a device may send, in bytes (enforced by the host before parsing). */
  maxMessageBytes: 16 * 1024,
  /** A connection must say who it is within this time, or it is dropped. */
  joinTimeoutMs: 10_000,
  /** How long a host may be offline before the role passes to another device. */
  hostGraceMs: 60_000,
  /** A room nobody is connected to is deleted after this long (long enough to reconnect after a lock). */
  disconnectedTtlMs: 15 * 60_000,
  /** A room with nobody doing anything is deleted after this long, even if devices are connected. */
  idleTtlMs: 3 * 60 * 60_000,
} as const;

export type RoomPhase = 'lobby' | 'playing' | 'finished';

/** Messages a device sends. */
export type ClientMessage =
  | {
      readonly type: 'join';
      readonly protocol: number;
      readonly name: string;
      /** Proves it is a device that was in the room before (a reload, a dropped connection). */
      readonly token?: string;
      /** The rules version of the game that the device's app has. */
      readonly rules?: number;
    }
  | { readonly type: 'seat'; readonly seat: number | null }
  | { readonly type: 'config'; readonly config: unknown }
  | { readonly type: 'start' }
  | { readonly type: 'action'; readonly action: unknown }
  | { readonly type: 'reset' }
  | { readonly type: 'leave' };

export type ErrorCode =
  | 'bad-message'
  | 'protocol-mismatch'
  | 'rules-mismatch'
  | 'not-joined'
  | 'bad-name'
  | 'room-full'
  | 'bad-seat'
  | 'not-host'
  | 'wrong-phase'
  | 'invalid-config'
  | 'seats-incomplete'
  | 'no-seat'
  | 'unknown-game'
  | 'room-closed'
  /** The host has no room with this code (it never existed, or it has expired). */
  | 'room-not-found'
  /** Too many messages or connections too fast. */
  | 'rate-limited';

export interface MemberView {
  readonly id: string;
  readonly name: string;
  readonly seat: number | null;
  readonly connected: boolean;
}

/** Everything a device may know about the room. It never contains a game's state. */
export interface RoomView {
  readonly code: string;
  readonly gameId: string;
  /** The rules version the room's game runs, so an app with other rules can refuse to join. */
  readonly rulesVersion: number;
  readonly phase: RoomPhase;
  /** The game's settings (not secret). */
  readonly config: unknown;
  /** Why the settings cannot start a game yet, or null. */
  readonly configError: string | null;
  readonly seatCount: number;
  readonly seatNames: readonly string[];
  readonly hostId: string;
  readonly members: readonly MemberView[];
  readonly you: { readonly id: string; readonly seat: number | null; readonly host: boolean };
}

/** Messages the server sends. */
export type ServerMessage =
  | { readonly type: 'joined'; readonly token: string; readonly deviceId: string }
  | { readonly type: 'room'; readonly v: number; readonly room: RoomView }
  | {
      readonly type: 'view';
      readonly v: number;
      /** The seat this view is for. */
      readonly seat: number;
      readonly actingSeat: number;
      readonly over: boolean;
      readonly view: unknown;
    }
  /** The game refused an action; nothing changed. */
  | { readonly type: 'refused'; readonly error: string }
  | { readonly type: 'error'; readonly code: ErrorCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks the shape of a message from a device. Anything else is `null`. Contents are checked later. */
export function parseClientMessage(data: unknown): ClientMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case 'join': {
      const { protocol, name, token, rules } = data;
      if (typeof protocol !== 'number' || typeof name !== 'string') return null;
      if (token !== undefined && typeof token !== 'string') return null;
      if (rules !== undefined && typeof rules !== 'number') return null;
      return {
        type: 'join',
        protocol,
        name,
        ...(token === undefined ? {} : { token }),
        ...(rules === undefined ? {} : { rules }),
      };
    }
    case 'seat': {
      const { seat } = data;
      if (seat === null || (typeof seat === 'number' && Number.isInteger(seat))) {
        return { type: 'seat', seat };
      }
      return null;
    }
    case 'config':
      return 'config' in data ? { type: 'config', config: data.config } : null;
    case 'action':
      return 'action' in data ? { type: 'action', action: data.action } : null;
    case 'start':
    case 'reset':
    case 'leave':
      return { type: data.type };
    default:
      return null;
  }
}
