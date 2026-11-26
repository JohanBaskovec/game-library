import type { ErasedGameLogic, Result } from '@game-library/game-kit';
import { leCurseur } from '@game-library/le-curseur/logic';
import { describe, expect, it } from 'vitest';
import { createRoom, restoreRoom, step, type RoomEffect, type RoomEvent } from './engine.ts';
import { LIMITS, PROTOCOL_VERSION, type ServerMessage } from './protocol.ts';
import { ROOM_FORMAT, type RoomEnv, type RoomState } from './state.ts';

// --- A small game, to test the engine without any real game ------------------------------------

interface RelayState {
  n: number;
  rounds: number;
}

/** Two seats take turns sending "inc"; each seat's view carries a secret that belongs to it alone. */
const relay: ErasedGameLogic = {
  id: 'relay',
  rulesVersion: 4,
  saveFormat: 1,
  seatCount: 2,
  defaultConfig: () => ({ rounds: 2 }),
  normalizeConfig: (input) => {
    const rounds = (input as { rounds?: unknown } | null)?.rounds;
    return { rounds: typeof rounds === 'number' && Number.isInteger(rounds) ? rounds : 2 };
  },
  validateConfig: (config) => ((config as { rounds: number }).rounds >= 1 ? null : 'bad-rounds'),
  seatNames: () => ['Left', 'Right'],
  setup: (config) => ({ n: 0, rounds: (config as { rounds: number }).rounds }),
  apply(state, seat, action): Result<unknown> {
    const game = state as RelayState;
    const type = (action as { type?: unknown } | null)?.type;
    if (type === 'boom') throw new Error('the game crashed');
    if (type !== 'inc') return { ok: false, error: 'invalid-action' };
    if (seat !== game.n % 2) return { ok: false, error: 'wrong-seat' };
    return { ok: true, state: { ...game, n: game.n + 1 } };
  },
  view: (state, seat) => {
    const game = state as RelayState;
    return { secret: seat === game.n % 2, mine: `SECRET-OF-SEAT-${seat}`, n: game.n };
  },
  activeSeat: (state) => (state as RelayState).n % 2,
  isOver: (state) => (state as RelayState).n >= (state as RelayState).rounds,
  restore: (input) => {
    const game = input as Partial<RelayState> | null;
    return game && Number.isInteger(game.n) && Number.isInteger(game.rounds)
      ? (game as RelayState)
      : null;
  },
};

const env: RoomEnv = {
  game: (id) =>
    id === 'relay'
      ? relay
      : id === 'le-curseur'
        ? (leCurseur as unknown as ErasedGameLogic)
        : undefined,
};

// --- A tiny host: runs events through the engine and keeps what each socket received -----------

class Harness {
  room: RoomState;
  now = 1_000_000;
  counter = 0;
  readonly received: Record<string, ServerMessage[]> = {};
  readonly effects: RoomEffect[] = [];
  expired = false;
  wake: number | null = null;

  constructor(gameId = 'relay', config: unknown = { rounds: 2 }) {
    const created = createRoom(env, {
      code: 'ABCDE',
      gameId,
      config,
      hostToken: 'host-token-0123456789abcdef01234567',
      hostDeviceId: 'host0000',
      now: this.now,
    });
    if (!created.ok) throw new Error(created.error);
    this.room = created.state;
  }

  private entropy(): string {
    this.counter += 1;
    return this.counter.toString(16).padStart(8, '0').repeat(8);
  }

  run(event: RoomEvent): readonly RoomEffect[] {
    const result = step(env, this.room, event, { now: this.now, entropy: this.entropy() });
    this.room = result.room;
    for (const effect of result.effects) {
      this.effects.push(effect);
      if (effect.type === 'send') (this.received[effect.conn] ??= []).push(effect.message);
      if (effect.type === 'expire') this.expired = true;
      if (effect.type === 'wake') this.wake = effect.at;
    }
    return result.effects;
  }

  connect(conn: string): void {
    this.run({ type: 'connected', conn });
  }

  send(conn: string, data: unknown): readonly RoomEffect[] {
    return this.run({ type: 'message', conn, data });
  }

  disconnect(conn: string): void {
    this.run({ type: 'disconnected', conn });
  }

  tick(): readonly RoomEffect[] {
    return this.run({ type: 'tick' });
  }

  advance(ms: number): void {
    this.now += ms;
  }

  /** Connects a socket and joins it. Returns the token it was given. */
  join(conn: string, name: string, token?: string): string {
    this.connect(conn);
    this.send(conn, {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name,
      ...(token ? { token } : {}),
    });
    const joined = this.received[conn]?.find((message) => message.type === 'joined');
    if (joined?.type !== 'joined') throw new Error(`${name} could not join`);
    return joined.token;
  }

  hostJoin(conn = 'c-host', name = 'Host'): string {
    return this.join(conn, name, 'host-token-0123456789abcdef01234567');
  }

  last<T extends ServerMessage['type']>(
    conn: string,
    type: T,
  ): Extract<ServerMessage, { type: T }> | undefined {
    const all = (this.received[conn] ?? []).filter((message) => message.type === type);
    return all[all.length - 1] as Extract<ServerMessage, { type: T }> | undefined;
  }

  errors(conn: string): string[] {
    return (this.received[conn] ?? []).flatMap((message) =>
      message.type === 'error' ? [message.code] : [],
    );
  }

  clear(conn: string): void {
    this.received[conn] = [];
  }

  closed(): string[] {
    return this.effects.flatMap((effect) => (effect.type === 'close' ? [effect.conn] : []));
  }
}

/** A room with a host in seat 0 and a guest in seat 1, ready to start. */
function readyRoom(gameId = 'relay', config: unknown = { rounds: 2 }): Harness {
  const h = new Harness(gameId, config);
  h.hostJoin();
  h.join('c-guest', 'Guest');
  h.send('c-host', { type: 'seat', seat: 0 });
  h.send('c-guest', { type: 'seat', seat: 1 });
  return h;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// --- Tests -------------------------------------------------------------------------------------

describe('creating a room', () => {
  it('starts in the lobby with the creator as host, not yet named', () => {
    const h = new Harness();
    expect(h.room.phase).toBe('lobby');
    expect(h.room.hostId).toBe('host0000');
    expect(h.room.devices).toHaveLength(1);
    expect(h.room.devices[0]?.name).toBe('');
    expect(h.room.game).toBeNull();
    expect(h.room.format).toBe(ROOM_FORMAT);
  });

  it('refuses a game this host does not have, and one the creator’s app has other rules for', () => {
    const base = { code: 'ABCDE', config: {}, hostToken: 't', hostDeviceId: 'h', now: 0 };
    expect(createRoom(env, { ...base, gameId: 'nope' })).toEqual({
      ok: false,
      error: 'unknown-game',
    });
    expect(createRoom(env, { ...base, gameId: 'relay', rules: 3 })).toEqual({
      ok: false,
      error: 'rules-mismatch',
    });
    expect(createRoom(env, { ...base, gameId: 'relay', rules: 4 }).ok).toBe(true);
  });

  it('lets the game clean the settings it is given', () => {
    const h = new Harness('relay', { rounds: 'many', extra: 1 });
    expect(h.room.config).toEqual({ rounds: 2 });
  });
});

describe('joining', () => {
  it('names the host when the first device joins with the host token', () => {
    const h = new Harness();
    const token = h.hostJoin('c1', '  Alice   Smith ');
    expect(token).toBe('host-token-0123456789abcdef01234567');
    expect(h.room.devices[0]?.name).toBe('Alice Smith');
    const room = h.last('c1', 'room');
    expect(room?.room.you).toEqual({ id: 'host0000', seat: null, host: true });
    expect(room?.room.members).toEqual([
      { id: 'host0000', name: 'Alice Smith', seat: null, connected: true },
    ]);
  });

  it('gives a new device its own token and id, and tells the others', () => {
    const h = new Harness();
    h.hostJoin();
    const token = h.join('c2', 'Bob');
    const joined = h.last('c2', 'joined');
    expect(joined?.deviceId).toHaveLength(8);
    expect(token).toHaveLength(32);
    expect(token).not.toBe('host-token-0123456789abcdef01234567');
    expect(h.last('c-host', 'room')?.room.members.map((m) => m.name)).toEqual(['Host', 'Bob']);
    expect(h.last('c2', 'room')?.room.you.host).toBe(false);
  });

  it('sends the join acknowledgement before the room', () => {
    const h = new Harness();
    h.hostJoin();
    expect(h.received['c-host']?.map((m) => m.type)).toEqual(['joined', 'room']);
  });

  it('refuses a message from a socket that has not said who it is', () => {
    const h = new Harness();
    h.connect('c1');
    h.send('c1', { type: 'seat', seat: 0 });
    expect(h.errors('c1')).toEqual(['not-joined']);
  });

  it('refuses malformed messages without changing anything', () => {
    const h = new Harness();
    h.hostJoin();
    const version = h.room.version;
    for (const data of [null, 'x', 42, [], {}, { type: 'nope' }, { type: 'seat', seat: 'a' }]) {
      h.send('c-host', data);
    }
    expect(h.errors('c-host')).toEqual(Array(7).fill('bad-message'));
    expect(h.room.version).toBe(version);
  });

  it('refuses another protocol version and closes the socket', () => {
    const h = new Harness();
    h.connect('c1');
    h.send('c1', { type: 'join', protocol: 99, name: 'A' });
    expect(h.errors('c1')).toEqual(['protocol-mismatch']);
    expect(h.closed()).toContain('c1');
    expect(h.room.connections['c1']).toBeUndefined();
  });

  it('refuses a device whose app has other rules for the game', () => {
    const h = new Harness();
    h.connect('c1');
    h.send('c1', { type: 'join', protocol: PROTOCOL_VERSION, name: 'A', rules: 3 });
    expect(h.errors('c1')).toEqual(['rules-mismatch']);
    expect(h.closed()).toContain('c1');
    h.connect('c2');
    h.send('c2', { type: 'join', protocol: PROTOCOL_VERSION, name: 'A', rules: 4 });
    expect(h.last('c2', 'joined')).toBeDefined();
  });

  it('needs a name, and cuts it to 20 characters', () => {
    const h = new Harness();
    h.hostJoin();
    h.connect('c2');
    h.send('c2', { type: 'join', protocol: PROTOCOL_VERSION, name: '   ' });
    expect(h.errors('c2')).toEqual(['bad-name']);
    h.join('c3', 'W'.repeat(60));
    expect(h.room.devices.at(-1)?.name).toBe('W'.repeat(LIMITS.maxNameLength));
  });

  it('does not let a socket join twice', () => {
    const h = new Harness();
    h.hostJoin();
    h.send('c-host', { type: 'join', protocol: PROTOCOL_VERSION, name: 'Again' });
    expect(h.errors('c-host')).toEqual(['bad-message']);
    expect(h.room.devices).toHaveLength(1);
  });

  it('is full at the maximum number of devices', () => {
    const h = new Harness();
    h.hostJoin();
    for (let i = 1; i < LIMITS.maxDevices; i++) h.join(`c${i}`, `P${i}`);
    expect(h.room.devices).toHaveLength(LIMITS.maxDevices);
    h.connect('late');
    h.send('late', { type: 'join', protocol: PROTOCOL_VERSION, name: 'Late' });
    expect(h.errors('late')).toEqual(['room-full']);
    expect(h.closed()).toContain('late');
    expect(h.room.devices).toHaveLength(LIMITS.maxDevices);
  });

  it('never tells a device another device’s token', () => {
    const h = new Harness();
    const hostToken = h.hostJoin();
    const guestToken = h.join('c2', 'Bob');
    const toHost = JSON.stringify(h.received['c-host']);
    const toGuest = JSON.stringify(h.received['c2']);
    expect(toHost).not.toContain(guestToken);
    expect(toGuest).not.toContain(hostToken);
  });
});

describe('coming back', () => {
  it('lets a device return with its token: same identity, same seat', () => {
    const h = readyRoom();
    const token = (h.received['c-guest']?.find((m) => m.type === 'joined') as { token: string })
      .token;
    h.disconnect('c-guest');
    expect(h.last('c-host', 'room')?.room.members.find((m) => m.name === 'Guest')?.connected).toBe(
      false,
    );

    h.join('c-guest-2', 'Guest', token);
    const room = h.last('c-guest-2', 'room')?.room;
    expect(room?.you.id).toBe(h.room.devices[1]?.id);
    expect(room?.you.seat).toBe(1);
    expect(h.room.devices).toHaveLength(2);
    expect(h.last('c-host', 'room')?.room.members.find((m) => m.name === 'Guest')?.connected).toBe(
      true,
    );
  });

  it('lets it rename itself when it comes back', () => {
    const h = readyRoom();
    const token = (h.received['c-guest']?.find((m) => m.type === 'joined') as { token: string })
      .token;
    h.disconnect('c-guest');
    h.join('c-guest-2', 'Robert', token);
    expect(h.room.devices[1]?.name).toBe('Robert');
  });

  it('treats a token the room does not know as a new device', () => {
    const h = new Harness();
    h.hostJoin();
    h.join('c2', 'Stranger', 'not-a-real-token-at-all-0000000000');
    expect(h.room.devices).toHaveLength(2);
  });

  it('hands a returning player the current view of the game', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    const token = (h.received['c-guest']?.find((m) => m.type === 'joined') as { token: string })
      .token;
    h.disconnect('c-guest');
    h.join('c-back', 'Guest', token);
    const view = h.last('c-back', 'view');
    expect(view?.seat).toBe(1);
    expect(view?.view).toMatchObject({ mine: 'SECRET-OF-SEAT-1', n: 0 });
  });

  it('serves two sockets of the same device', () => {
    const h = readyRoom();
    const token = (h.received['c-guest']?.find((m) => m.type === 'joined') as { token: string })
      .token;
    h.join('c-guest-tab2', 'Guest', token);
    h.send('c-host', { type: 'start' });
    expect(h.last('c-guest', 'view')).toBeDefined();
    expect(h.last('c-guest-tab2', 'view')).toBeDefined();
    expect(h.room.devices).toHaveLength(2);
  });
});

describe('seats', () => {
  it('lets a device take a seat and leave it, and shows it to everyone', () => {
    const h = new Harness();
    h.hostJoin();
    h.join('c2', 'Bob');
    h.send('c2', { type: 'seat', seat: 1 });
    expect(h.last('c-host', 'room')?.room.members.find((m) => m.name === 'Bob')?.seat).toBe(1);
    h.send('c2', { type: 'seat', seat: null });
    expect(h.last('c-host', 'room')?.room.members.find((m) => m.name === 'Bob')?.seat).toBeNull();
  });

  it('lets several devices share a seat', () => {
    const h = new Harness();
    h.hostJoin();
    h.join('c2', 'Bob');
    h.send('c-host', { type: 'seat', seat: 0 });
    h.send('c2', { type: 'seat', seat: 0 });
    expect(h.room.devices.map((d) => d.seat)).toEqual([0, 0]);
  });

  it('refuses a seat that does not exist', () => {
    const h = new Harness();
    h.hostJoin();
    for (const seat of [2, -1, 99]) h.send('c-host', { type: 'seat', seat });
    expect(h.errors('c-host')).toEqual(['bad-seat', 'bad-seat', 'bad-seat']);
    expect(h.room.devices[0]?.seat).toBeNull();
  });

  it('says which rules version the game runs, so an app with other rules can refuse', () => {
    const h = new Harness();
    h.hostJoin();
    expect(h.last('c-host', 'room')?.room.rulesVersion).toBe(4);
    expect(h.last('c-host', 'room')?.room.gameId).toBe('relay');
  });

  it('names the seats after the settings', () => {
    const h = new Harness();
    h.hostJoin();
    expect(h.last('c-host', 'room')?.room.seatNames).toEqual(['Left', 'Right']);
    expect(h.last('c-host', 'room')?.room.seatCount).toBe(2);
  });
});

describe('settings', () => {
  it('can be changed by the host in the lobby, and are cleaned by the game', () => {
    const h = new Harness();
    h.hostJoin();
    h.join('c2', 'Bob');
    h.send('c-host', { type: 'config', config: { rounds: 7, junk: true } });
    expect(h.room.config).toEqual({ rounds: 7 });
    expect(h.last('c2', 'room')?.room.config).toEqual({ rounds: 7 });
  });

  it('say why they cannot start a game', () => {
    const h = new Harness();
    h.hostJoin();
    h.send('c-host', { type: 'config', config: { rounds: 0 } });
    expect(h.last('c-host', 'room')?.room.configError).toBe('bad-rounds');
    h.send('c-host', { type: 'config', config: { rounds: 3 } });
    expect(h.last('c-host', 'room')?.room.configError).toBeNull();
  });

  it('can only be changed by the host', () => {
    const h = new Harness();
    h.hostJoin();
    h.join('c2', 'Bob');
    h.send('c2', { type: 'config', config: { rounds: 9 } });
    expect(h.errors('c2')).toEqual(['not-host']);
    expect(h.room.config).toEqual({ rounds: 2 });
  });

  it('cannot be changed once the game has started', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    h.send('c-host', { type: 'config', config: { rounds: 9 } });
    expect(h.errors('c-host')).toEqual(['wrong-phase']);
  });
});

describe('starting', () => {
  it('needs the host, valid settings and a connected device in every seat', () => {
    const h = new Harness();
    h.hostJoin();
    h.join('c2', 'Bob');
    h.send('c2', { type: 'start' });
    expect(h.errors('c2')).toEqual(['not-host']);

    h.send('c-host', { type: 'start' });
    expect(h.errors('c-host')).toEqual(['seats-incomplete']);

    h.send('c-host', { type: 'seat', seat: 0 });
    h.send('c2', { type: 'seat', seat: 0 });
    h.send('c-host', { type: 'start' });
    expect(h.errors('c-host')).toEqual(['seats-incomplete', 'seats-incomplete']);

    h.send('c2', { type: 'seat', seat: 1 });
    h.send('c-host', { type: 'config', config: { rounds: 0 } });
    h.send('c-host', { type: 'start' });
    expect(h.errors('c-host').at(-1)).toBe('invalid-config');
    expect(h.room.phase).toBe('lobby');

    h.send('c-host', { type: 'config', config: { rounds: 2 } });
    h.send('c-host', { type: 'start' });
    expect(h.room.phase).toBe('playing');
    expect(h.room.game).toEqual({ n: 0, rounds: 2 });
  });

  it('does not count a seat whose only device is offline', () => {
    const h = readyRoom();
    h.disconnect('c-guest');
    h.send('c-host', { type: 'start' });
    expect(h.errors('c-host')).toEqual(['seats-incomplete']);
  });

  it('gives each seat only its own view, and a device without a seat none', () => {
    const h = readyRoom();
    h.join('c-watch', 'Watcher');
    h.send('c-host', { type: 'start' });
    expect(h.last('c-host', 'view')?.view).toMatchObject({ mine: 'SECRET-OF-SEAT-0' });
    expect(h.last('c-guest', 'view')?.view).toMatchObject({ mine: 'SECRET-OF-SEAT-1' });
    expect(h.last('c-watch', 'view')).toBeUndefined();
    expect(h.last('c-watch', 'room')?.room.phase).toBe('playing');
  });

  it('cannot be done twice', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    h.send('c-host', { type: 'start' });
    expect(h.errors('c-host')).toEqual(['wrong-phase']);
  });
});

describe('playing', () => {
  it('applies an action from the seat that may act, and tells both seats', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    h.send('c-host', { type: 'action', action: { type: 'inc' } });
    expect(h.last('c-host', 'view')).toMatchObject({ actingSeat: 1, over: false, view: { n: 1 } });
    expect(h.last('c-guest', 'view')).toMatchObject({ actingSeat: 1, over: false, view: { n: 1 } });
  });

  it('refuses an action the game refuses, telling only the sender and changing nothing', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    const version = h.room.version;
    h.clear('c-host');
    h.clear('c-guest');
    h.send('c-guest', { type: 'action', action: { type: 'inc' } });
    expect(h.received['c-guest']).toEqual([{ type: 'refused', error: 'wrong-seat' }]);
    expect(h.received['c-host']).toEqual([]);
    expect(h.room.version).toBe(version);
    expect(h.room.game).toEqual({ n: 0, rounds: 2 });
  });

  it('refuses an action before the game starts, and one from a device without a seat', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'action', action: { type: 'inc' } });
    expect(h.errors('c-host')).toEqual(['wrong-phase']);
    h.join('c-watch', 'Watcher');
    h.send('c-host', { type: 'start' });
    h.send('c-watch', { type: 'action', action: { type: 'inc' } });
    expect(h.errors('c-watch')).toEqual(['no-seat']);
  });

  it('survives a game that throws: the action is refused and the room carries on', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    h.send('c-host', { type: 'action', action: { type: 'boom' } });
    expect(h.last('c-host', 'refused')).toEqual({ type: 'refused', error: 'invalid-action' });
    h.send('c-host', { type: 'action', action: { type: 'inc' } });
    expect(h.last('c-host', 'view')?.view).toMatchObject({ n: 1 });
  });

  it('is finished when the game is over, and then refuses actions', () => {
    const h = readyRoom('relay', { rounds: 2 });
    h.send('c-host', { type: 'start' });
    h.send('c-host', { type: 'action', action: { type: 'inc' } });
    h.send('c-guest', { type: 'action', action: { type: 'inc' } });
    expect(h.room.phase).toBe('finished');
    expect(h.last('c-guest', 'view')).toMatchObject({ over: true });
    h.send('c-host', { type: 'action', action: { type: 'inc' } });
    expect(h.errors('c-host')).toEqual(['wrong-phase']);
  });

  it('lets the host go back to the lobby, keeping the seats, from a running or a finished game', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    h.send('c-guest', { type: 'reset' });
    expect(h.errors('c-guest')).toEqual(['not-host']);
    h.send('c-host', { type: 'reset' });
    expect(h.room.phase).toBe('lobby');
    expect(h.room.game).toBeNull();
    expect(h.room.devices.map((d) => d.seat)).toEqual([0, 1]);
    h.send('c-host', { type: 'reset' });
    expect(h.errors('c-host')).toEqual(['wrong-phase']);
    h.send('c-host', { type: 'start' });
    expect(h.room.phase).toBe('playing');
  });
});

describe('leaving and dropping', () => {
  it('frees the seat and closes the sockets of a device that leaves', () => {
    const h = readyRoom();
    h.send('c-guest', { type: 'leave' });
    expect(h.closed()).toContain('c-guest');
    expect(h.room.devices.map((d) => d.name)).toEqual(['Host']);
    expect(h.last('c-host', 'room')?.room.members.map((m) => m.name)).toEqual(['Host']);
  });

  it('passes the host role to the earliest device still connected when the host leaves', () => {
    const h = readyRoom();
    h.join('c3', 'Third');
    h.disconnect('c-guest');
    h.send('c-host', { type: 'leave' });
    expect(h.room.hostId).toBe(h.room.devices.find((d) => d.name === 'Third')?.id);
    expect(h.last('c3', 'room')?.room.you.host).toBe(true);
  });

  it('closes the room when the last device leaves', () => {
    const h = new Harness();
    h.hostJoin();
    h.send('c-host', { type: 'leave' });
    expect(h.expired).toBe(true);
    expect(h.closed()).toContain('c-host');
  });

  it('keeps a device that only dropped, marked offline, with its seat', () => {
    const h = readyRoom();
    h.disconnect('c-guest');
    expect(h.room.devices).toHaveLength(2);
    expect(h.room.devices[1]?.seat).toBe(1);
    expect(h.last('c-host', 'room')?.room.members[1]?.connected).toBe(false);
  });

  it('keeps the host role through a short absence, and passes it on after a long one', () => {
    const h = readyRoom();
    h.disconnect('c-host');
    h.advance(LIMITS.hostGraceMs - 1);
    h.tick();
    expect(h.room.hostId).toBe('host0000');

    h.advance(1);
    h.tick();
    expect(h.room.hostId).toBe(h.room.devices[1]?.id);
    expect(h.last('c-guest', 'room')?.room.you.host).toBe(true);
  });

  it('keeps the host role when nobody else is here to take it', () => {
    const h = readyRoom();
    h.disconnect('c-host');
    h.disconnect('c-guest');
    h.advance(LIMITS.hostGraceMs * 3);
    h.tick();
    expect(h.room.hostId).toBe('host0000');
    expect(h.expired).toBe(false);
  });

  it('lets the old host come back as an ordinary device', () => {
    const h = readyRoom();
    h.disconnect('c-host');
    h.advance(LIMITS.hostGraceMs);
    h.tick();
    h.hostJoin('c-host-2', 'Host');
    expect(h.last('c-host-2', 'room')?.room.you.host).toBe(false);
  });
});

describe('time', () => {
  it('drops a socket that never says who it is', () => {
    const h = new Harness();
    h.connect('c1');
    h.advance(LIMITS.joinTimeoutMs - 1);
    h.tick();
    expect(h.room.connections['c1']).toBeDefined();
    h.advance(1);
    h.tick();
    expect(h.room.connections['c1']).toBeUndefined();
    expect(h.closed()).toContain('c1');
  });

  it('deletes a room nobody is connected to after the delay, counted from the last disconnect', () => {
    const h = readyRoom();
    h.advance(LIMITS.disconnectedTtlMs - 60_000); // an idle room that still has people in it
    h.tick();
    expect(h.expired).toBe(false);
    h.disconnect('c-host');
    h.disconnect('c-guest');
    h.advance(LIMITS.disconnectedTtlMs - 1);
    h.tick();
    expect(h.expired).toBe(false);
    h.advance(1);
    h.tick();
    expect(h.expired).toBe(true);
  });

  it('lets a device come back before the delay, and the room goes on', () => {
    const h = readyRoom();
    const token = (h.received['c-guest']?.find((m) => m.type === 'joined') as { token: string })
      .token;
    h.disconnect('c-host');
    h.disconnect('c-guest');
    h.advance(LIMITS.disconnectedTtlMs - 1000);
    h.tick();
    h.join('c-guest-2', 'Guest', token);
    h.advance(LIMITS.disconnectedTtlMs - 1000);
    h.tick();
    expect(h.expired).toBe(false);
  });

  it('deletes a room where nothing happens for hours, even with devices connected', () => {
    const h = readyRoom();
    h.advance(LIMITS.idleTtlMs - 1);
    h.tick();
    expect(h.expired).toBe(false);
    h.advance(1);
    h.tick();
    expect(h.expired).toBe(true);
    expect(h.closed()).toEqual(expect.arrayContaining(['c-host', 'c-guest']));
  });

  it('counts a message as activity', () => {
    const h = readyRoom();
    h.advance(LIMITS.idleTtlMs - 1000);
    h.send('c-host', { type: 'seat', seat: 1 });
    h.advance(LIMITS.idleTtlMs - 1000);
    h.tick();
    expect(h.expired).toBe(false);
  });

  it('asks to be woken at the next moment something is due', () => {
    const h = new Harness();
    h.connect('c1');
    expect(h.wake).toBe(h.now + LIMITS.joinTimeoutMs);
    h.hostJoin('c-host');
    h.disconnect('c1');
    expect(h.wake).toBe(h.now + LIMITS.idleTtlMs);
    h.disconnect('c-host');
    expect(h.wake).toBe(h.now + LIMITS.disconnectedTtlMs);
  });

  it('asks to be woken when a host’s grace period ends, if someone could take over', () => {
    const h = readyRoom();
    h.disconnect('c-host');
    expect(h.wake).toBe(h.now + LIMITS.hostGraceMs);
  });
});

describe('the engine itself', () => {
  it('never changes the room it is given', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    const frozen = deepFreeze(JSON.parse(JSON.stringify(h.room)) as RoomState);
    const copy = JSON.stringify(frozen);
    const ctx = { now: h.now, entropy: 'ab'.repeat(32) };
    step(
      env,
      frozen,
      { type: 'message', conn: 'c-host', data: { type: 'action', action: { type: 'inc' } } },
      ctx,
    );
    step(env, frozen, { type: 'message', conn: 'c-guest', data: { type: 'leave' } }, ctx);
    step(env, frozen, { type: 'disconnected', conn: 'c-host' }, ctx);
    step(env, frozen, { type: 'connected', conn: 'new' }, ctx);
    step(env, frozen, { type: 'tick' }, ctx);
    expect(JSON.stringify(frozen)).toBe(copy);
  });

  it('refuses to run without enough randomness', () => {
    const h = new Harness();
    expect(() => step(env, h.room, { type: 'tick' }, { now: 1, entropy: 'abc' })).not.toThrow();
    h.connect('c1');
    expect(() =>
      step(
        env,
        h.room,
        { type: 'message', conn: 'c1', data: { type: 'join', protocol: 1, name: 'A' } },
        { now: 1, entropy: 'abc' },
      ),
    ).toThrow(/entropy/);
  });

  it('ignores events about sockets it does not know', () => {
    const h = new Harness();
    const effects = h.send('ghost', { type: 'seat', seat: 0 });
    expect(effects.some((effect) => effect.type === 'send')).toBe(false);
    h.disconnect('ghost');
    expect(h.room.devices).toHaveLength(1);
  });

  it('asks the host to save the room only when it changed', () => {
    const h = readyRoom();
    const changed = h.send('c-host', { type: 'seat', seat: 1 });
    expect(changed.some((effect) => effect.type === 'persist')).toBe(true);
    const unchanged = h.send('c-host', { type: 'start-now' });
    expect(unchanged.some((effect) => effect.type === 'persist')).toBe(false);
  });

  it('numbers its changes, so a device can ignore a message that arrives late', () => {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    const versions = (h.received['c-host'] ?? []).flatMap((m) => (m.type === 'room' ? [m.v] : []));
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('saved rooms', () => {
  function playingRoom(): RoomState {
    const h = readyRoom();
    h.send('c-host', { type: 'start' });
    h.send('c-host', { type: 'action', action: { type: 'inc' } });
    return JSON.parse(JSON.stringify(h.room)) as RoomState;
  }

  it('comes back from JSON and goes on exactly where it was, without sockets', () => {
    const saved = playingRoom();
    const restored = restoreRoom(env, saved);
    expect(restored).not.toBeNull();
    expect(restored?.connections).toEqual({});
    expect(restored?.game).toEqual(saved.game);
    expect(restored?.phase).toBe('playing');
    expect(restored?.devices).toEqual(saved.devices);
  });

  it('lets the devices reconnect to a restored room', () => {
    const saved = playingRoom();
    const h = new Harness();
    h.room = restoreRoom(env, saved) as RoomState;
    const guestToken = saved.devices[1]?.token as string;
    h.join('back', 'Guest', guestToken);
    expect(h.last('back', 'view')).toMatchObject({ seat: 1, actingSeat: 1, view: { n: 1 } });
  });

  it('puts a finished game back to the lobby, since a game that is over is not kept', () => {
    const h = readyRoom('relay', { rounds: 1 });
    h.send('c-host', { type: 'start' });
    h.send('c-host', { type: 'action', action: { type: 'inc' } });
    expect(h.room.phase).toBe('finished');
    const restored = restoreRoom(env, JSON.parse(JSON.stringify(h.room)));
    expect(restored?.phase).toBe('lobby');
    expect(restored?.game).toBeNull();
  });

  it('drops a room made with other rules, an unknown game or a bad game state', () => {
    const saved = playingRoom() as RoomState & Record<string, unknown>;
    const damaged: [string, (room: Record<string, unknown>) => void][] = [
      ['other format', (r) => (r.format = 99)],
      ['other rules', (r) => (r.rulesVersion = 1)],
      ['unknown game', (r) => (r.gameId = 'nope')],
      ['bad game state', (r) => (r.game = 'junk')],
      ['no host', (r) => (r.hostId = 'nobody')],
      ['bad phase', (r) => (r.phase = 'dancing')],
      ['bad devices', (r) => (r.devices = 'x')],
      ['a device with a bad seat', (r) => ((r.devices as { seat: unknown }[])[0]!.seat = 7)],
      ['a device with no token', (r) => delete (r.devices as Record<string, unknown>[])[0]!.token],
    ];
    for (const [name, damage] of damaged) {
      const copy = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
      damage(copy);
      expect(restoreRoom(env, copy), name).toBeNull();
    }
    for (const junk of [null, 'room', 3, [], {}]) expect(restoreRoom(env, junk)).toBeNull();
  });
});

describe('secrets in a room (Le Curseur, played through the engine)', () => {
  const config = { teamNames: ['Blue', 'Orange'], roundCount: 2, contentLocale: 'fr' };

  function curseurRoom(): Harness {
    const h = readyRoom('le-curseur', config);
    h.send('c-host', { type: 'start' });
    return h;
  }

  /** The conn of the seat that gives the clue now, and the other's. */
  function sides(h: Harness): { giver: string; guesser: string } {
    const game = h.room.game as { turns: { giverTeam: number }[] };
    const giverSeat = game.turns.at(-1)?.giverTeam;
    return giverSeat === 0
      ? { giver: 'c-host', guesser: 'c-guest' }
      : { giver: 'c-guest', guesser: 'c-host' };
  }

  it('shows the target to the giver only, until the result', () => {
    const h = curseurRoom();
    const { giver, guesser } = sides(h);
    const game = h.room.game as { turns: { target: number }[] };
    const target = game.turns[0]?.target;

    expect((h.last(giver, 'view')?.view as { target: number }).target).toBe(target);
    expect((h.last(guesser, 'view')?.view as { target: number | null }).target).toBeNull();
    expect((h.last(guesser, 'view')?.view as { pair: unknown }).pair).toBeNull();

    h.send(giver, { type: 'action', action: { type: 'clue', text: 'banana' } });
    expect((h.last(guesser, 'view')?.view as { clue: string }).clue).toBe('banana');
    expect((h.last(guesser, 'view')?.view as { target: number | null }).target).toBeNull();
    expect((h.last(giver, 'view')?.view as { target: number }).target).toBe(target);

    h.send(guesser, { type: 'action', action: { type: 'guess', position: 50 } });
    expect((h.last(guesser, 'view')?.view as { target: number }).target).toBe(target);
  });

  it('never sends a game’s state, its generator or the other seat’s secrets to any device', () => {
    const h = curseurRoom();
    for (let turn = 0; turn < 4; turn++) {
      const { giver, guesser } = sides(h);
      // Every message of this turn carries a version from here on; earlier ones belong to turns
      // in which this device played the other role (a giver legitimately sees the target).
      const turnStart = h.room.version;
      h.send(giver, { type: 'action', action: { type: 'clue', text: `w${turn}` } });

      const asGuesser = (h.received[guesser] ?? []).filter(
        (message) => message.type === 'view' && message.v >= turnStart,
      );
      expect(asGuesser.length).toBeGreaterThan(0);
      for (const message of asGuesser) {
        if (message.type !== 'view') continue;
        const view = message.view as { phase: string; target: number | null; pair: unknown };
        expect(['give', 'guess']).toContain(view.phase);
        expect(view.target, `turn ${turn}: the guesser was shown the target`).toBeNull();
        if (view.phase === 'give') expect(view.pair).toBeNull();
      }

      h.send(guesser, { type: 'action', action: { type: 'guess', position: 50 } });
      h.send(guesser, { type: 'action', action: { type: 'continue' } });
    }
    expect(h.room.phase).toBe('finished');

    // Whatever a device received, in any phase, holds no game state, generator or other device's token.
    const tokens = h.room.devices.map((device) => device.token);
    for (const device of h.room.devices) {
      const conn = device.name === 'Host' ? 'c-host' : 'c-guest';
      const everything = JSON.stringify(h.received[conn]);
      expect(everything).not.toContain('"rng"');
      expect(everything).not.toContain('usedPairIndexes');
      for (const token of tokens) {
        if (token !== device.token) expect(everything).not.toContain(token);
      }
    }
  });

  it('shows the target to the guesser as soon as the result is in', () => {
    const h = curseurRoom();
    const { giver, guesser } = sides(h);
    const target = (h.room.game as { turns: { target: number }[] }).turns[0]?.target;
    h.send(giver, { type: 'action', action: { type: 'clue', text: 'x' } });
    h.send(guesser, { type: 'action', action: { type: 'guess', position: 50 } });
    for (const conn of [giver, guesser]) {
      expect(h.last(conn, 'view')?.view).toMatchObject({ phase: 'reveal', target });
    }
  });

  it('lets either team play on a phone of its own through a whole game, ending on the recap', () => {
    const h = curseurRoom();
    for (let turn = 0; turn < 4; turn++) {
      const { giver, guesser } = sides(h);
      h.send(giver, { type: 'action', action: { type: 'clue', text: 'x' } });
      h.send(guesser, { type: 'action', action: { type: 'guess', position: 10 * turn } });
      h.send(guesser, { type: 'action', action: { type: 'continue' } });
    }
    expect(h.room.phase).toBe('finished');
    expect((h.last('c-host', 'view')?.view as { turns: unknown[] }).turns).toHaveLength(4);
    expect((h.last('c-guest', 'view')?.view as { phase: string }).phase).toBe('recap');
  });

  it('refuses the guessing team an attempt to give the clue', () => {
    const h = curseurRoom();
    const { guesser } = sides(h);
    h.send(guesser, { type: 'action', action: { type: 'clue', text: 'cheat' } });
    expect(h.last(guesser, 'refused')).toEqual({ type: 'refused', error: 'wrong-seat' });
  });

  it('shows both teams their names as seat names', () => {
    const h = readyRoom('le-curseur', config);
    expect(h.last('c-host', 'room')?.room.seatNames).toEqual(['Blue', 'Orange']);
  });
});
