import { randomBytes, randomInt } from 'node:crypto';
import {
  createRoom,
  generateRoomCode,
  step,
  type RoomEffect,
  type RoomEnv,
  type RoomEvent,
  type RoomState,
} from '@game-library/room';

/** What the manager needs from a connection. The WebSocket layer, or a fake in tests, provides it. */
export interface Socket {
  send(text: string): void;
  close(reason: string): void;
}

/** Time and timers, replaceable in tests. */
export interface Clock {
  now(): number;
  /** Calls `callback` at time `at` (in `now()` units). Returns a function that cancels it. */
  setTimer(at: number, callback: () => void): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimer(at, callback) {
    const timer = setTimeout(callback, Math.max(0, at - Date.now()));
    return () => clearTimeout(timer);
  },
};

export interface RoomManagerOptions {
  readonly env: RoomEnv;
  readonly clock?: Clock;
  /** Cryptographically random lowercase hexadecimal text of `bytes` bytes. */
  readonly randomHex?: (bytes: number) => string;
  readonly randomInt?: (maxExclusive: number) => number;
  readonly maxRooms?: number;
  /** One line per event worth knowing about. Never contains names, clues or tokens. */
  readonly log?: (line: string) => void;
}

export type CreateResult =
  | { readonly ok: true; readonly code: string; readonly token: string }
  | { readonly ok: false; readonly error: 'unknown-game' | 'rules-mismatch' | 'too-many-rooms' };

interface Entry {
  state: RoomState;
  readonly sockets: Map<string, Socket>;
  cancelTimer: (() => void) | null;
}

const DEFAULT_MAX_ROOMS = 500;

/**
 * Holds the rooms of one process, in memory (P-6). It feeds events to the room engine and carries out what
 * the engine asks: sending messages, closing sockets, setting timers, forgetting rooms. It has no rules of
 * its own.
 */
export class RoomManager {
  private readonly env: RoomEnv;
  private readonly clock: Clock;
  private readonly randomHex: (bytes: number) => string;
  private readonly randomInt: (maxExclusive: number) => number;
  private readonly maxRooms: number;
  private readonly log: (line: string) => void;
  private readonly rooms = new Map<string, Entry>();
  private nextConnection = 1;

  constructor(options: RoomManagerOptions) {
    this.env = options.env;
    this.clock = options.clock ?? systemClock;
    this.randomHex = options.randomHex ?? ((bytes) => randomBytes(bytes).toString('hex'));
    this.randomInt = options.randomInt ?? ((max) => randomInt(max));
    this.maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
    this.log = options.log ?? (() => {});
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  /** Makes a room. The caller gets the code and the secret that makes its first device the host. */
  create(request: { gameId: string; rules?: number; config?: unknown }): CreateResult {
    if (this.rooms.size >= this.maxRooms) return { ok: false, error: 'too-many-rooms' };

    let code = generateRoomCode(this.randomInt);
    for (let attempt = 0; this.rooms.has(code); attempt++) {
      if (attempt >= 20) return { ok: false, error: 'too-many-rooms' };
      code = generateRoomCode(this.randomInt);
    }

    const token = this.randomHex(16);
    const created = createRoom(this.env, {
      code,
      gameId: request.gameId,
      ...(request.rules === undefined ? {} : { rules: request.rules }),
      config: request.config,
      hostToken: token,
      hostDeviceId: this.randomHex(4),
      now: this.clock.now(),
    });
    if (!created.ok) {
      return {
        ok: false,
        error: created.error === 'rules-mismatch' ? 'rules-mismatch' : 'unknown-game',
      };
    }

    const entry: Entry = { state: created.state, sockets: new Map(), cancelTimer: null };
    this.rooms.set(code, entry);
    // A room nobody ever joins must still go away.
    this.process(code, { type: 'tick' });
    this.log(`room created (game ${request.gameId}), ${this.rooms.size} open`);
    return { ok: true, code, token };
  }

  /** A socket arrived for a room. Returns its connection id, or null when there is no such room. */
  connect(code: string, socket: Socket): string | null {
    const entry = this.rooms.get(code);
    if (!entry) return null;
    const conn = `c${this.nextConnection++}`;
    entry.sockets.set(conn, socket);
    this.process(code, { type: 'connected', conn });
    return conn;
  }

  /** One message from a socket, already parsed from JSON. */
  message(code: string, conn: string, data: unknown): void {
    this.process(code, { type: 'message', conn, data });
  }

  /** A socket went away. A connection the room already closed is ignored. */
  disconnect(code: string, conn: string): void {
    const entry = this.rooms.get(code);
    if (!entry || !entry.sockets.has(conn)) return;
    entry.sockets.delete(conn);
    this.process(code, { type: 'disconnected', conn });
  }

  /** Closes everything, e.g. when the process is stopping. */
  closeAll(): void {
    for (const [code, entry] of this.rooms) {
      entry.cancelTimer?.();
      for (const socket of entry.sockets.values()) socket.close('server-stopping');
      this.rooms.delete(code);
    }
  }

  private process(code: string, event: RoomEvent): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    let effects: readonly RoomEffect[];
    try {
      const result = step(this.env, entry.state, event, {
        now: this.clock.now(),
        entropy: this.randomHex(32),
      });
      entry.state = result.room;
      effects = result.effects;
    } catch (error) {
      // A bug in one room must not stop the others: that room is closed.
      this.log(`room closed after an error: ${error instanceof Error ? error.message : 'unknown'}`);
      this.drop(code, 'room-closed');
      return;
    }
    this.apply(code, entry, effects);
  }

  private apply(code: string, entry: Entry, effects: readonly RoomEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'send':
          entry.sockets.get(effect.conn)?.send(JSON.stringify(effect.message));
          break;
        case 'close': {
          const socket = entry.sockets.get(effect.conn);
          entry.sockets.delete(effect.conn);
          socket?.close(effect.reason);
          break;
        }
        case 'wake':
          entry.cancelTimer?.();
          entry.cancelTimer =
            effect.at === null
              ? null
              : this.clock.setTimer(effect.at, () => this.process(code, { type: 'tick' }));
          break;
        case 'expire':
          this.drop(code, 'room-closed');
          this.log(`room expired, ${this.rooms.size} open`);
          return;
        case 'persist':
          break; // Rooms live in memory only.
      }
    }
  }

  private drop(code: string, reason: string): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.cancelTimer?.();
    for (const socket of entry.sockets.values()) socket.close(reason);
    this.rooms.delete(code);
  }
}
