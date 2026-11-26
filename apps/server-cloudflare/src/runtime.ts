import {
  LIMITS,
  createRateLimiter,
  createRoom,
  restoreRoom,
  step,
  type Connection,
  type RateLimiter,
  type RoomEffect,
  type RoomEnv,
  type RoomEvent,
  type RoomState,
  type ServerMessage,
} from '@game-library/room';

/** A live WebSocket of the room. `conn` is its id, and survives the object being evicted from memory. */
export interface RuntimeSocket {
  readonly conn: string;
  /** When it connected. Kept with the socket, so a socket that never joined can still time out after waking. */
  readonly since: number;
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** Where the room is kept between events. In a Durable Object it is the object's own storage. */
export interface RuntimeStorage {
  /** The saved room, as it was written, or undefined. */
  load(): Promise<unknown>;
  save(room: RoomState): Promise<void>;
  clear(): Promise<void>;
  /** Wakes the room at this time (or never, for null). */
  setAlarm(at: number | null): Promise<void>;
}

export interface RuntimeDeps {
  readonly env: RoomEnv;
  readonly storage: RuntimeStorage;
  /** Every WebSocket that is open now. After the object wakes from hibernation this is how it finds them. */
  sockets(): readonly RuntimeSocket[];
  now(): number;
  /** Cryptographically random lowercase hexadecimal text of `bytes` bytes. */
  randomHex(bytes: number): string;
  log?(line: string): void;
  readonly limits?: { readonly messagesBurst?: number; readonly messagesPerSecond?: number };
}

export interface RoomRequest {
  readonly code: string;
  readonly gameId: string;
  readonly rules?: number;
  readonly config?: unknown;
  readonly token: string;
  readonly deviceId: string;
}

export type CreateOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'exists' | 'unknown-game' | 'rules-mismatch' };

const MAX_STRIKES = 5;
const textEncoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runs one room on Cloudflare: feeds events to the room engine and carries out what it asks. It does what the
 * Node.js host's `RoomManager` does, with two differences that come from Durable Objects:
 *
 * - The object can be evicted from memory while its WebSockets stay open (the Hibernation API). The runtime
 *   keeps nothing that cannot be rebuilt: the room is loaded from storage on the first event after waking, and
 *   the connections are matched with the sockets that are still open.
 * - Timers are alarms: the engine's `wake` effect sets the object's alarm.
 *
 * It imports nothing from Cloudflare, so the part that is hard to get right (waking up) is tested here.
 */
export class RoomRuntime {
  private readonly deps: RuntimeDeps;
  private room: RoomState | null = null;
  private loaded = false;
  private readonly perSocket = new Map<string, { limiter: RateLimiter; strikes: number }>();

  constructor(deps: RuntimeDeps) {
    this.deps = deps;
  }

  /** Makes the room. Fails when this code is already a room, or the game or its rules are not right. */
  async create(request: RoomRequest): Promise<CreateOutcome> {
    if ((await this.load()) !== null) return { ok: false, error: 'exists' };
    const created = createRoom(this.deps.env, {
      code: request.code,
      gameId: request.gameId,
      ...(request.rules === undefined ? {} : { rules: request.rules }),
      config: request.config,
      hostToken: request.token,
      hostDeviceId: request.deviceId,
      now: this.deps.now(),
    });
    if (!created.ok) {
      return {
        ok: false,
        error: created.error === 'rules-mismatch' ? 'rules-mismatch' : 'unknown-game',
      };
    }
    this.room = created.state;
    this.loaded = true;
    await this.deps.storage.save(created.state);
    // A room nobody ever joins must still go away: this schedules its expiry.
    await this.process({ type: 'tick' });
    return { ok: true };
  }

  /** Whether this object holds a room. */
  async exists(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  /** A socket arrived. Without a room it is told so and closed. */
  async connect(socket: RuntimeSocket): Promise<void> {
    if ((await this.load()) === null) {
      socket.send(
        JSON.stringify({ type: 'error', code: 'room-not-found' } satisfies ServerMessage),
      );
      socket.close(4404, 'room-not-found');
      return;
    }
    await this.process({ type: 'connected', conn: socket.conn });
  }

  /** One message from a socket, as the WebSocket delivered it. */
  async message(socket: RuntimeSocket, data: string | ArrayBuffer): Promise<void> {
    if ((await this.load()) === null) return;
    const state = this.stateOf(socket.conn);

    if (typeof data !== 'string') {
      return this.strike(socket, state, 'bad-message');
    }
    if (textEncoder.encode(data).length > LIMITS.maxMessageBytes) {
      socket.close(1009, 'message-too-big');
      await this.process({ type: 'disconnected', conn: socket.conn });
      this.perSocket.delete(socket.conn);
      return;
    }
    if (!state.limiter.allow(this.deps.now())) return this.strike(socket, state, 'rate-limited');

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return this.strike(socket, state, 'bad-message');
    }
    await this.process({ type: 'message', conn: socket.conn, data: parsed });
  }

  /** A socket closed or failed. */
  async closed(socket: RuntimeSocket): Promise<void> {
    this.perSocket.delete(socket.conn);
    if ((await this.load()) === null) return;
    await this.process({ type: 'disconnected', conn: socket.conn });
  }

  /** The alarm went off. */
  async alarm(): Promise<void> {
    await this.process({ type: 'tick' });
  }

  // --- Waking up ---------------------------------------------------------------------------------

  /**
   * The room, from memory or else from storage. A saved room with other rules, or whose game no longer
   * passes the game's own check, is dropped. Connections are rebuilt from the sockets that are still open.
   */
  private async load(): Promise<RoomState | null> {
    if (this.loaded) return this.room;
    this.loaded = true;

    const raw = await this.deps.storage.load();
    if (raw === undefined) return (this.room = null);

    const restored = restoreRoom(this.deps.env, raw);
    if (!restored) {
      this.deps.log?.('a saved room was dropped: it does not fit this version');
      await this.deps.storage.clear();
      await this.deps.storage.setAlarm(null);
      return (this.room = null);
    }

    const saved = isRecord(raw) && isRecord(raw.connections) ? raw.connections : {};
    const deviceIds = new Set(restored.devices.map((device) => device.id));
    const connections: Record<string, Connection> = {};
    for (const socket of this.deps.sockets()) {
      const entry = saved[socket.conn];
      const deviceId =
        isRecord(entry) && typeof entry.deviceId === 'string' && deviceIds.has(entry.deviceId)
          ? entry.deviceId
          : null;
      const since = isRecord(entry) && typeof entry.since === 'number' ? entry.since : socket.since;
      connections[socket.conn] = { deviceId, since };
    }
    restored.connections = connections;
    return (this.room = restored);
  }

  // --- Running events ----------------------------------------------------------------------------

  private async process(event: RoomEvent): Promise<void> {
    const room = await this.load();
    if (!room) return;
    let result;
    try {
      result = step(this.deps.env, room, event, {
        now: this.deps.now(),
        entropy: this.deps.randomHex(32),
      });
    } catch (error) {
      // A bug in this room must not leave it half-working: it is closed.
      this.deps.log?.(
        `room closed after an error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.expire('room-closed');
      return;
    }
    this.room = result.room;
    await this.apply(result.effects);
  }

  private async apply(effects: readonly RoomEffect[]): Promise<void> {
    let save = false;
    let alarm: { at: number | null } | null = null;
    for (const effect of effects) {
      switch (effect.type) {
        case 'send':
          this.socketFor(effect.conn)?.send(JSON.stringify(effect.message));
          break;
        case 'close':
          this.perSocket.delete(effect.conn);
          this.socketFor(effect.conn)?.close(1000, effect.reason.slice(0, 100));
          break;
        case 'persist':
          save = true;
          break;
        case 'wake':
          alarm = { at: effect.at };
          break;
        case 'expire':
          await this.expire('room-closed');
          return;
      }
    }
    // Saved before the alarm is set, and both before the event ends: the object's output gate holds the messages
    // above until the write is safe, so a device is never told something the room could forget.
    if (save && this.room) await this.deps.storage.save(this.room);
    if (alarm) await this.deps.storage.setAlarm(alarm.at);
  }

  /** The room is over: sockets closed, storage emptied, alarm cancelled. */
  private async expire(reason: string): Promise<void> {
    for (const socket of this.deps.sockets()) socket.close(1000, reason);
    this.perSocket.clear();
    this.room = null;
    this.loaded = true;
    await this.deps.storage.clear();
    await this.deps.storage.setAlarm(null);
  }

  // --- Sockets -----------------------------------------------------------------------------------

  private socketFor(conn: string): RuntimeSocket | undefined {
    return this.deps.sockets().find((socket) => socket.conn === conn);
  }

  private stateOf(conn: string): { limiter: RateLimiter; strikes: number } {
    let state = this.perSocket.get(conn);
    if (!state) {
      state = {
        limiter: createRateLimiter({
          capacity: this.deps.limits?.messagesBurst ?? 30,
          refillPerSecond: this.deps.limits?.messagesPerSecond ?? 5,
        }),
        strikes: 0,
      };
      this.perSocket.set(conn, state);
    }
    return state;
  }

  /** A message that cannot be used: the sender is told, and after five the socket is closed. */
  private async strike(
    socket: RuntimeSocket,
    state: { strikes: number },
    code: 'bad-message' | 'rate-limited',
  ): Promise<void> {
    socket.send(JSON.stringify({ type: 'error', code } satisfies ServerMessage));
    state.strikes += 1;
    if (state.strikes >= MAX_STRIKES) {
      socket.close(1008, 'too-many-bad-messages');
      this.perSocket.delete(socket.conn);
      await this.process({ type: 'disconnected', conn: socket.conn });
    }
  }
}
