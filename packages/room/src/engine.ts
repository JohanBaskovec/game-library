import type { ErasedGameLogic, Result } from '@game-library/game-kit';
import {
  LIMITS,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type MemberView,
  type RoomPhase,
  type RoomView,
  type ServerMessage,
} from './protocol.ts';
import {
  ROOM_FORMAT,
  type Connection,
  type DeviceRecord,
  type RoomEnv,
  type RoomState,
} from './state.ts';

/** What happens to a room. The host turns these into sockets, timers and storage. */
export type RoomEvent =
  | { readonly type: 'connected'; readonly conn: string }
  /** `data` is the parsed JSON of one message; the host has already limited its size. */
  | { readonly type: 'message'; readonly conn: string; readonly data: unknown }
  | { readonly type: 'disconnected'; readonly conn: string }
  /** The time the engine asked to be woken at has come (or any moment: ticks are harmless). */
  | { readonly type: 'tick' };

/** What the host must do in return. */
export type RoomEffect =
  | { readonly type: 'send'; readonly conn: string; readonly message: ServerMessage }
  | { readonly type: 'close'; readonly conn: string; readonly reason: string }
  /** The room changed: save it if the host saves rooms. */
  | { readonly type: 'persist' }
  /** Call back with a `tick` at this time (replaces any earlier request), or never when null. */
  | { readonly type: 'wake'; readonly at: number | null }
  /** The room is over: forget it. All its connections are closed by `close` effects before this one. */
  | { readonly type: 'expire' };

export interface StepContext {
  /** The current time in milliseconds. The engine never reads the clock. */
  readonly now: number;
  /**
   * Fresh cryptographically random hexadecimal text, from the host, for every event. The engine takes
   * tokens, ids and game seeds from it and draws no randomness itself.
   */
  readonly entropy: string;
}

export interface StepResult {
  readonly room: RoomState;
  readonly effects: readonly RoomEffect[];
}

const MIN_ENTROPY = 48;
const TOKEN_LENGTH = 32;
const DEVICE_ID_LENGTH = 8;
const SEED_LENGTH = 32;

// --- Creating a room ---------------------------------------------------------------------------

export interface RoomInit {
  readonly code: string;
  readonly gameId: string;
  /** The rules version of the game that the creator's app has. */
  readonly rules?: number;
  /** The creator's choice of settings. It is cleaned by the game. */
  readonly config: unknown;
  /** The creator's secret and public id: the first device to join with this token is the host. */
  readonly hostToken: string;
  readonly hostDeviceId: string;
  readonly now: number;
}

export function createRoom(env: RoomEnv, init: RoomInit): Result<RoomState> {
  const game = env.game(init.gameId);
  if (!game) return { ok: false, error: 'unknown-game' };
  if (init.rules !== undefined && init.rules !== game.rulesVersion) {
    return { ok: false, error: 'rules-mismatch' };
  }
  const host: DeviceRecord = {
    id: init.hostDeviceId,
    token: init.hostToken,
    name: '',
    seat: null,
    joinedAt: init.now,
    lastSeen: init.now,
  };
  return {
    ok: true,
    state: {
      format: ROOM_FORMAT,
      code: init.code,
      gameId: init.gameId,
      rulesVersion: game.rulesVersion,
      config: game.normalizeConfig(init.config),
      phase: 'lobby',
      hostId: host.id,
      devices: [host],
      connections: {},
      game: null,
      createdAt: init.now,
      lastActivityAt: init.now,
      version: 1,
    },
  };
}

// --- Saved rooms -------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restoreDevice(input: unknown): DeviceRecord | null {
  if (!isRecord(input)) return null;
  const { id, token, name, seat, joinedAt, lastSeen } = input;
  if (typeof id !== 'string' || typeof token !== 'string' || typeof name !== 'string') return null;
  if (seat !== null && !(typeof seat === 'number' && Number.isInteger(seat) && seat >= 0))
    return null;
  if (typeof joinedAt !== 'number' || typeof lastSeen !== 'number') return null;
  return { id, token, name, seat, joinedAt, lastSeen };
}

/**
 * Checks a room read back from storage. A room made with other rules is dropped (null), and so is one
 * whose game state no longer passes the game's own check; a finished game falls back to the lobby,
 * because a game that is over is not kept. Open connections are never restored: the host rebuilds them.
 */
export function restoreRoom(env: RoomEnv, input: unknown): RoomState | null {
  if (!isRecord(input) || input.format !== ROOM_FORMAT) return null;
  const {
    code,
    gameId,
    rulesVersion,
    config,
    phase,
    hostId,
    devices,
    game,
    createdAt,
    lastActivityAt,
    version,
  } = input;
  if (typeof code !== 'string' || typeof gameId !== 'string' || typeof hostId !== 'string')
    return null;
  if (
    typeof createdAt !== 'number' ||
    typeof lastActivityAt !== 'number' ||
    typeof version !== 'number'
  ) {
    return null;
  }
  if (phase !== 'lobby' && phase !== 'playing' && phase !== 'finished') return null;
  const logic = env.game(gameId);
  if (!logic || rulesVersion !== logic.rulesVersion) return null;
  if (!Array.isArray(devices)) return null;

  const restored: DeviceRecord[] = [];
  for (const raw of devices) {
    const device = restoreDevice(raw);
    if (!device || (device.seat !== null && device.seat >= logic.seatCount)) return null;
    restored.push(device);
  }
  if (!restored.some((device) => device.id === hostId)) return null;

  let restoredPhase: RoomPhase = phase;
  let restoredGame: unknown = null;
  if (phase === 'playing') {
    restoredGame = logic.restore(game);
    if (restoredGame === null) return null;
  } else if (phase === 'finished') {
    restoredPhase = 'lobby';
  }

  return {
    format: ROOM_FORMAT,
    code,
    gameId,
    rulesVersion: logic.rulesVersion,
    config: logic.normalizeConfig(config),
    phase: restoredPhase,
    hostId,
    devices: restored,
    connections: {},
    game: restoredGame,
    createdAt,
    lastActivityAt,
    version: version + 1,
  };
}

// --- Views -------------------------------------------------------------------------------------

function connectedDeviceIds(room: RoomState): Set<string> {
  const ids = new Set<string>();
  for (const connection of Object.values(room.connections)) {
    if (connection.deviceId !== null) ids.add(connection.deviceId);
  }
  return ids;
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxNameLength).trim();
}

function roomView(logic: ErasedGameLogic, room: RoomState, device: DeviceRecord): RoomView {
  const online = connectedDeviceIds(room);
  const names = logic.seatNames(room.config);
  const members: MemberView[] = room.devices
    .filter((member) => member.name !== '')
    .map((member) => ({
      id: member.id,
      name: member.name,
      seat: member.seat,
      connected: online.has(member.id),
    }));
  return {
    code: room.code,
    gameId: room.gameId,
    rulesVersion: room.rulesVersion,
    phase: room.phase,
    config: room.config,
    configError: logic.validateConfig(room.config),
    seatCount: logic.seatCount,
    seatNames: Array.from({ length: logic.seatCount }, (_, seat) => names[seat] ?? ''),
    hostId: room.hostId,
    members,
    you: { id: device.id, seat: device.seat, host: device.id === room.hostId },
  };
}

// --- The engine --------------------------------------------------------------------------------

/** One event worth of work on a copy of the room, collecting what the host must do. */
class Draft {
  readonly env: RoomEnv;
  readonly ctx: StepContext;
  readonly room: RoomState;
  readonly effects: RoomEffect[] = [];
  changed = false;

  constructor(env: RoomEnv, original: RoomState, ctx: StepContext) {
    this.env = env;
    this.ctx = ctx;
    this.room = {
      ...original,
      devices: original.devices.map((device) => ({ ...device })),
      connections: Object.fromEntries(
        Object.entries(original.connections).map(([conn, value]) => [conn, { ...value }]),
      ),
    };
  }

  get logic(): ErasedGameLogic {
    const logic = this.env.game(this.room.gameId);
    if (!logic) throw new Error(`The room's game "${this.room.gameId}" is not known to this host`);
    return logic;
  }

  /** Marks the room as changed: devices will be told, and the host asked to save it. */
  touch(): void {
    this.changed = true;
  }

  send(conn: string, message: ServerMessage): void {
    this.effects.push({ type: 'send', conn, message });
  }

  fail(conn: string, code: ErrorCode, close = false): void {
    this.send(conn, { type: 'error', code });
    if (close) this.close(conn, code);
  }

  close(conn: string, reason: string): void {
    delete this.room.connections[conn];
    this.effects.push({ type: 'close', conn, reason });
  }

  device(id: string | null): DeviceRecord | undefined {
    return id === null ? undefined : this.room.devices.find((device) => device.id === id);
  }

  /** Tells every connected device what it may know now: the room, and its seat's view of the game. */
  broadcast(): void {
    const { room } = this;
    room.version += 1;
    const logic = this.logic;
    for (const [conn, connection] of Object.entries(room.connections)) {
      const device = this.device(connection.deviceId);
      if (!device) continue;
      this.send(conn, { type: 'room', v: room.version, room: roomView(logic, room, device) });
      if ((room.phase === 'playing' || room.phase === 'finished') && device.seat !== null) {
        this.send(conn, {
          type: 'view',
          v: room.version,
          seat: device.seat,
          actingSeat: logic.activeSeat(room.game),
          over: logic.isOver(room.game),
          view: logic.view(room.game, device.seat),
        });
      }
    }
  }
}

function entropySlice(ctx: StepContext, from: number, length: number): string {
  if (ctx.entropy.length < MIN_ENTROPY) throw new Error('Not enough entropy for a room event');
  return ctx.entropy.slice(from, from + length);
}

/** The host passes to the earliest device that is connected, or failing that the earliest one. */
function nextHost(room: RoomState, exceptId: string): string | null {
  const online = connectedDeviceIds(room);
  const candidates = room.devices.filter((device) => device.id !== exceptId);
  const first = candidates.find((device) => online.has(device.id)) ?? candidates[0];
  return first ? first.id : null;
}

function handleJoin(
  draft: Draft,
  conn: string,
  message: Extract<ClientMessage, { type: 'join' }>,
): void {
  const { room, ctx } = draft;
  const connection = room.connections[conn];
  if (!connection) return;
  if (message.protocol !== PROTOCOL_VERSION) return draft.fail(conn, 'protocol-mismatch', true);
  if (connection.deviceId !== null) return draft.fail(conn, 'bad-message');
  if (message.rules !== undefined && message.rules !== room.rulesVersion) {
    return draft.fail(conn, 'rules-mismatch', true);
  }

  const name = cleanName(message.name);
  let device =
    message.token === undefined
      ? undefined
      : room.devices.find((candidate) => candidate.token === message.token);

  if (device) {
    if (name) device.name = name;
    else if (!device.name) return draft.fail(conn, 'bad-name');
  } else {
    if (!name) return draft.fail(conn, 'bad-name');
    if (room.devices.length >= LIMITS.maxDevices) return draft.fail(conn, 'room-full', true);
    device = {
      id: entropySlice(ctx, TOKEN_LENGTH, DEVICE_ID_LENGTH),
      token: entropySlice(ctx, 0, TOKEN_LENGTH),
      name,
      seat: null,
      joinedAt: ctx.now,
      lastSeen: ctx.now,
    };
    room.devices.push(device);
  }

  device.lastSeen = ctx.now;
  room.lastActivityAt = ctx.now;
  connection.deviceId = device.id;
  draft.send(conn, { type: 'joined', token: device.token, deviceId: device.id });
  draft.touch();
}

function handleMessage(draft: Draft, conn: string, data: unknown): void {
  const { room, ctx } = draft;
  const connection = room.connections[conn];
  if (!connection) return; // A socket the room does not know: ignored.

  const message = parseClientMessage(data);
  if (!message) return draft.fail(conn, 'bad-message');
  if (message.type === 'join') return handleJoin(draft, conn, message);

  const device = draft.device(connection.deviceId);
  if (!device) return draft.fail(conn, 'not-joined');
  room.lastActivityAt = ctx.now;
  const logic = draft.logic;
  const isHost = device.id === room.hostId;

  switch (message.type) {
    case 'seat': {
      if (message.seat !== null && (message.seat < 0 || message.seat >= logic.seatCount)) {
        return draft.fail(conn, 'bad-seat');
      }
      device.seat = message.seat;
      return draft.touch();
    }
    case 'config': {
      if (!isHost) return draft.fail(conn, 'not-host');
      if (room.phase !== 'lobby') return draft.fail(conn, 'wrong-phase');
      room.config = logic.normalizeConfig(message.config);
      return draft.touch();
    }
    case 'start': {
      if (!isHost) return draft.fail(conn, 'not-host');
      if (room.phase !== 'lobby') return draft.fail(conn, 'wrong-phase');
      if (logic.validateConfig(room.config) !== null) return draft.fail(conn, 'invalid-config');
      const online = connectedDeviceIds(room);
      for (let seat = 0; seat < logic.seatCount; seat++) {
        if (!room.devices.some((member) => member.seat === seat && online.has(member.id))) {
          return draft.fail(conn, 'seats-incomplete');
        }
      }
      try {
        room.game = logic.setup(room.config, entropySlice(ctx, 0, SEED_LENGTH));
      } catch {
        return draft.fail(conn, 'invalid-config');
      }
      room.phase = 'playing';
      return draft.touch();
    }
    case 'action': {
      if (room.phase !== 'playing') return draft.fail(conn, 'wrong-phase');
      if (device.seat === null) return draft.fail(conn, 'no-seat');
      let result: Result<unknown>;
      try {
        result = logic.apply(room.game, device.seat, message.action, ctx.now);
      } catch {
        // A game that throws must not take the room down: the action is simply refused.
        result = { ok: false, error: 'invalid-action' };
      }
      if (!result.ok) {
        draft.send(conn, { type: 'refused', error: result.error });
        return;
      }
      room.game = result.state;
      if (logic.isOver(room.game)) room.phase = 'finished';
      return draft.touch();
    }
    case 'reset': {
      if (!isHost) return draft.fail(conn, 'not-host');
      if (room.phase === 'lobby') return draft.fail(conn, 'wrong-phase');
      room.phase = 'lobby';
      room.game = null;
      return draft.touch();
    }
    case 'leave': {
      removeDevice(draft, device);
      return;
    }
  }
}

/** A device leaves for good: its sockets are closed, its seat is free, and a new host is chosen if needed. */
function removeDevice(draft: Draft, device: DeviceRecord): void {
  const { room } = draft;
  for (const [conn, connection] of Object.entries(room.connections)) {
    if (connection.deviceId === device.id) draft.close(conn, 'left');
  }
  room.devices = room.devices.filter((member) => member.id !== device.id);
  if (room.devices.length === 0) {
    expire(draft);
    return;
  }
  if (room.hostId === device.id) {
    const next = nextHost(room, device.id);
    if (next !== null) room.hostId = next;
  }
  draft.touch();
}

function expire(draft: Draft): void {
  for (const conn of Object.keys(draft.room.connections)) draft.close(conn, 'room-closed');
  draft.effects.push({ type: 'expire' });
}

function handleTick(draft: Draft): void {
  const { room, ctx } = draft;

  // Sockets that never said who they are.
  for (const [conn, connection] of Object.entries(room.connections)) {
    if (connection.deviceId === null && ctx.now - connection.since >= LIMITS.joinTimeoutMs) {
      draft.fail(conn, 'not-joined', true);
    }
  }

  // The room is over: nobody has been here for a while, or nothing has happened for a long time.
  const online = connectedDeviceIds(room);
  const idle = ctx.now - room.lastActivityAt;
  if ((online.size === 0 && idle >= LIMITS.disconnectedTtlMs) || idle >= LIMITS.idleTtlMs) {
    expire(draft);
    return;
  }

  // The host has been away too long: the room passes to someone who is here.
  const host = draft.device(room.hostId);
  if (host && !online.has(host.id) && ctx.now - host.lastSeen >= LIMITS.hostGraceMs) {
    const next = nextHost(room, host.id);
    if (next !== null && online.has(next)) {
      room.hostId = next;
      draft.touch();
    }
  }
}

function handleDisconnected(draft: Draft, conn: string): void {
  const { room, ctx } = draft;
  const connection = room.connections[conn];
  if (!connection) return;
  delete room.connections[conn];
  const device = draft.device(connection.deviceId);
  if (device) {
    device.lastSeen = ctx.now;
    // The time nobody is connected is counted from here.
    room.lastActivityAt = ctx.now;
    draft.touch();
  }
}

/** When the engine next needs a `tick`, or null when nothing is waiting. */
function nextWake(room: RoomState): number | null {
  const times: number[] = [];
  for (const connection of Object.values(room.connections)) {
    if (connection.deviceId === null) times.push(connection.since + LIMITS.joinTimeoutMs);
  }
  const online = connectedDeviceIds(room);
  times.push(
    room.lastActivityAt + (online.size === 0 ? LIMITS.disconnectedTtlMs : LIMITS.idleTtlMs),
  );
  const host = room.devices.find((device) => device.id === room.hostId);
  if (host && !online.has(host.id) && online.size > 0)
    times.push(host.lastSeen + LIMITS.hostGraceMs);
  return times.length === 0 ? null : Math.min(...times);
}

/**
 * Applies one event to a room. Pure: it returns a new room and the effects the host must carry out, and
 * never changes the room it is given. It reads no clock and draws no randomness (see `StepContext`).
 */
export function step(
  env: RoomEnv,
  room: RoomState,
  event: RoomEvent,
  ctx: StepContext,
): StepResult {
  const draft = new Draft(env, room, ctx);

  switch (event.type) {
    case 'connected': {
      const connection: Connection = { deviceId: null, since: ctx.now };
      draft.room.connections[event.conn] = connection;
      break;
    }
    case 'message':
      handleMessage(draft, event.conn, event.data);
      break;
    case 'disconnected':
      handleDisconnected(draft, event.conn);
      break;
    case 'tick':
      handleTick(draft);
      break;
  }

  const expired = draft.effects.some((effect) => effect.type === 'expire');
  if (draft.changed && !expired) {
    draft.broadcast();
    draft.effects.push({ type: 'persist' });
  }
  if (!expired) draft.effects.push({ type: 'wake', at: nextWake(draft.room) });
  return { room: draft.room, effects: draft.effects };
}
