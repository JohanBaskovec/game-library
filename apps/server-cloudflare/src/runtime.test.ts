import type { ErasedGameLogic } from '@game-library/game-kit';
import { findLogic } from '@game-library/registry/logics';
import { LIMITS, PROTOCOL_VERSION, type RoomState } from '@game-library/room';
import { describe, expect, it } from 'vitest';
import {
  RoomRuntime,
  type RuntimeDeps,
  type RuntimeSocket,
  type RuntimeStorage,
} from './runtime.ts';

const CONFIG = { teamNames: ['Blue', 'Orange'], roundCount: 1, contentLocale: 'fr' };
const HOST_TOKEN = 'a'.repeat(32);

class FakeStorage implements RuntimeStorage {
  saved: unknown;
  alarm: number | null = null;
  saves = 0;

  async load(): Promise<unknown> {
    return this.saved === undefined ? undefined : JSON.parse(JSON.stringify(this.saved));
  }

  async save(room: RoomState): Promise<void> {
    this.saved = JSON.parse(JSON.stringify(room)); // What a real store keeps: data, not objects.
    this.saves += 1;
  }

  async clear(): Promise<void> {
    this.saved = undefined;
  }

  async setAlarm(at: number | null): Promise<void> {
    this.alarm = at;
  }
}

class FakeSocket implements RuntimeSocket {
  readonly sent: Record<string, unknown>[] = [];
  closedWith: { code: number; reason: string } | null = null;

  readonly conn: string;
  readonly since: number;

  constructor(conn: string, since = 0) {
    this.conn = conn;
    this.since = since;
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }

  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
  }

  last(type: string): Record<string, unknown> | undefined {
    return this.sent.filter((message) => message.type === type).at(-1);
  }

  errors(): unknown[] {
    return this.sent.filter((message) => message.type === 'error').map((message) => message.code);
  }
}

/** A Durable Object's surroundings: storage and sockets that outlive the object in memory. */
function setup(game: (id: string) => ErasedGameLogic | undefined = findLogic) {
  const storage = new FakeStorage();
  const sockets: FakeSocket[] = [];
  let time = 1_000_000;
  let counter = 0;
  const log: string[] = [];
  const deps = (limits?: RuntimeDeps['limits']): RuntimeDeps => ({
    env: { game },
    storage,
    sockets: () => sockets.filter((socket) => socket.closedWith === null),
    now: () => time,
    randomHex: () => {
      counter += 1;
      return counter.toString(16).padStart(8, '0').repeat(8);
    },
    log: (line) => log.push(line),
    ...(limits ? { limits } : {}),
  });
  /** The object, in memory. Another call is the object waking up after being evicted. */
  const wake = (limits?: RuntimeDeps['limits']) => new RoomRuntime(deps(limits));
  const open = (conn: string) => {
    const socket = new FakeSocket(conn, time);
    sockets.push(socket);
    return socket;
  };
  return {
    storage,
    sockets,
    log,
    wake,
    open,
    advance: (ms: number) => (time += ms),
    now: () => time,
  };
}

const request = {
  code: 'K7M2P',
  gameId: 'le-curseur',
  config: CONFIG,
  token: HOST_TOKEN,
  deviceId: 'host0000',
};

async function join(runtime: RoomRuntime, socket: FakeSocket, name: string, token?: string) {
  await runtime.connect(socket);
  await runtime.message(
    socket,
    JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, name, ...(token ? { token } : {}) }),
  );
}

const send = (runtime: RoomRuntime, socket: FakeSocket, message: unknown) =>
  runtime.message(socket, JSON.stringify(message));

/** A room with a host in seat 0 and a guest in seat 1, ready to start. */
async function readyRoom() {
  const env = setup();
  const runtime = env.wake();
  await runtime.create(request);
  const host = env.open('c1');
  const guest = env.open('c2');
  await join(runtime, host, 'Ann', HOST_TOKEN);
  await join(runtime, guest, 'Bob');
  await send(runtime, host, { type: 'seat', seat: 0 });
  await send(runtime, guest, { type: 'seat', seat: 1 });
  return { ...env, runtime, host, guest };
}

describe('creating a room', () => {
  it('saves it and asks to be woken when it would expire', async () => {
    const env = setup();
    expect(await env.wake().create(request)).toEqual({ ok: true });
    const saved = env.storage.saved as RoomState;
    expect(saved.code).toBe('K7M2P');
    expect(saved.phase).toBe('lobby');
    expect(env.storage.alarm).toBe(env.now() + LIMITS.disconnectedTtlMs);
  });

  it('refuses a code that is already a room, even from another instance of the object', async () => {
    const env = setup();
    await env.wake().create(request);
    expect(await env.wake().create(request)).toEqual({ ok: false, error: 'exists' });
  });

  it('refuses an unknown game, and other rules', async () => {
    expect(
      await setup()
        .wake()
        .create({ ...request, gameId: 'nope' }),
    ).toEqual({ ok: false, error: 'unknown-game' });
    expect(
      await setup()
        .wake()
        .create({ ...request, rules: 99 }),
    ).toEqual({ ok: false, error: 'rules-mismatch' });
  });
});

describe('sockets', () => {
  it('tells a socket that there is no room, and closes it', async () => {
    const env = setup();
    const socket = env.open('c1');
    await env.wake().connect(socket);
    expect(socket.sent).toEqual([{ type: 'error', code: 'room-not-found' }]);
    expect(socket.closedWith).toEqual({ code: 4404, reason: 'room-not-found' });
  });

  it('joins a device and tells everyone, saving the room', async () => {
    const env = setup();
    const runtime = env.wake();
    await runtime.create(request);
    const host = env.open('c1');
    await join(runtime, host, 'Ann', HOST_TOKEN);
    expect(host.sent.map((message) => message.type)).toEqual(['joined', 'room']);
    const saved = env.storage.saved as RoomState;
    expect(saved.devices[0]?.name).toBe('Ann');
    expect(saved.connections['c1']?.deviceId).toBe('host0000');
  });

  it('closes a socket the engine closes, and forgets its state', async () => {
    const env = setup();
    const runtime = env.wake();
    await runtime.create(request);
    const socket = env.open('c1');
    await runtime.connect(socket);
    await runtime.message(socket, JSON.stringify({ type: 'join', protocol: 99, name: 'Old' }));
    expect(socket.errors()).toEqual(['protocol-mismatch']);
    expect(socket.closedWith?.reason).toBe('protocol-mismatch');
  });

  it('marks a device offline when its socket closes, and ignores a socket it does not know', async () => {
    const { runtime, host, guest } = await readyRoom();
    await runtime.closed(guest);
    const room = host.last('room') as { room: { members: { name: string; connected: boolean }[] } };
    expect(room.room.members.find((member) => member.name === 'Bob')?.connected).toBe(false);
    const before = host.sent.length;
    await runtime.closed(new FakeSocket('ghost'));
    expect(host.sent.length).toBe(before);
  });
});

describe('waking up after hibernation', () => {
  it('goes on with the game from storage: the sockets stay open, the object is new', async () => {
    const { wake, host, guest, storage } = await readyRoom();
    // Both devices are connected; the host starts the game; then the object is evicted from memory.
    const first = wake();
    await send(first, host, { type: 'start' });
    const hostView = host.last('view') as { actingSeat: number; view: { target: number | null } };
    expect(hostView).toBeDefined();
    expect((storage.saved as RoomState).phase).toBe('playing');

    const second = wake(); // a different object in memory: nothing of the first one is kept
    const giverIsHost = hostView.actingSeat === 0;
    const giver = giverIsHost ? host : guest;
    const guesser = giverIsHost ? guest : host;
    await send(second, giver, { type: 'action', action: { type: 'clue', text: 'banana' } });

    const guessing = guesser.last('view') as {
      view: { phase: string; clue: string; target: number | null };
    };
    expect(guessing.view.phase).toBe('guess');
    expect(guessing.view.clue).toBe('banana');
    // Still never shown the target, after waking up.
    expect(guessing.view.target).toBeNull();
    const giverView = giver.last('view') as { view: { target: number } };
    expect(typeof giverView.view.target).toBe('number');
  });

  it('remembers which device each socket is, so no one has to join again', async () => {
    const { wake, guest } = await readyRoom();
    const revived = wake();
    await send(revived, guest, { type: 'seat', seat: 1 }); // would be "not-joined" if the mapping were lost
    expect(guest.errors()).toEqual([]);
    const room = guest.last('room') as { room: { you: { seat: number | null } } };
    expect(room.room.you.seat).toBe(1);
  });

  it('finds a device offline if its socket died while the object slept', async () => {
    const { wake, host, guest } = await readyRoom();
    guest.closedWith = { code: 1006, reason: '' }; // gone, with no one to tell the room
    const revived = wake();
    await send(revived, host, { type: 'seat', seat: 0 });
    const room = host.last('room') as { room: { members: { name: string; connected: boolean }[] } };
    expect(room.room.members.find((member) => member.name === 'Bob')?.connected).toBe(false);
    expect(room.room.members.find((member) => member.name === 'Ann')?.connected).toBe(true);
  });

  it('treats a socket that arrived but never joined as unjoined, and times it out', async () => {
    const env = setup();
    const runtime = env.wake();
    await runtime.create(request);
    const stranger = env.open('c9');
    await runtime.connect(stranger);

    const revived = env.wake();
    env.advance(LIMITS.joinTimeoutMs);
    await revived.alarm();
    expect(stranger.closedWith?.reason).toBe('not-joined');
  });

  it('lets a device that reconnects after the wake-up come back with its token', async () => {
    const { wake, open, host, guest, storage } = await readyRoom();
    const token = (guest.sent.find((m) => m.type === 'joined') as { token: string }).token;
    const revived = wake();
    await revived.closed(guest);
    guest.closedWith = { code: 1006, reason: '' };
    const back = open('c3');
    await join(revived, back, 'Bob', token);
    expect((back.last('room') as { room: { you: { seat: number | null } } }).room.you.seat).toBe(1);
    expect((storage.saved as RoomState).devices).toHaveLength(2);
    expect(host.errors()).toEqual([]);
  });

  it('drops a saved room that does not fit this version, and says there is no room', async () => {
    const env = setup();
    await env.wake().create(request);
    (env.storage.saved as { rulesVersion: number }).rulesVersion = 99;
    const socket = env.open('c1');
    await env.wake().connect(socket);
    expect(socket.errors()).toEqual(['room-not-found']);
    expect(env.storage.saved).toBeUndefined();
    expect(env.log.join('\n')).toContain('dropped');
  });

  it('drops a saved room that is not a room at all', async () => {
    for (const junk of ['text', 42, [], {}, { format: 99 }]) {
      const env = setup();
      env.storage.saved = junk;
      const socket = env.open('c1');
      await env.wake().connect(socket);
      expect(socket.errors(), JSON.stringify(junk)).toEqual(['room-not-found']);
    }
  });
});

describe('what a socket may send', () => {
  it('has a message that is too large close its socket', async () => {
    const { runtime, host } = await readyRoom();
    await runtime.message(
      host,
      JSON.stringify({ type: 'config', config: { junk: 'x'.repeat(LIMITS.maxMessageBytes) } }),
    );
    expect(host.closedWith).toEqual({ code: 1009, reason: 'message-too-big' });
  });

  it('counts the size in bytes, not in characters', async () => {
    const { runtime, host } = await readyRoom();
    // 7000 characters of three bytes each are 21000 bytes.
    await runtime.message(
      host,
      JSON.stringify({ type: 'config', config: { junk: 'é'.repeat(7000) + '€'.repeat(3000) } }),
    );
    expect(host.closedWith?.code).toBe(1009);
  });

  it('answers binary and unreadable messages, and closes the socket after five', async () => {
    const { runtime, host, storage } = await readyRoom();
    await runtime.message(host, new ArrayBuffer(3));
    await runtime.message(host, '{ not json');
    expect(host.errors()).toEqual(['bad-message', 'bad-message']);
    for (let i = 0; i < 3; i++) await runtime.message(host, 'nope');
    expect(host.closedWith).toEqual({ code: 1008, reason: 'too-many-bad-messages' });
    // The room knows that device is gone.
    const saved = storage.saved as RoomState;
    expect(Object.keys(saved.connections)).not.toContain('c1');
  });

  it('limits how fast a socket may send', async () => {
    const env = setup();
    const runtime = env.wake({ messagesBurst: 3, messagesPerSecond: 0.001 });
    await runtime.create(request);
    const socket = env.open('c1');
    await join(runtime, socket, 'Ann', HOST_TOKEN);
    for (let i = 0; i < 12; i++) await send(runtime, socket, { type: 'seat', seat: 0 });
    expect(socket.errors()).toContain('rate-limited');
    expect(socket.closedWith?.code).toBe(1008);
  });

  it('ignores a message when there is no room', async () => {
    const env = setup();
    const socket = env.open('c1');
    await env.wake().message(socket, JSON.stringify({ type: 'start' }));
    expect(socket.sent).toEqual([]);
  });
});

describe('alarms', () => {
  it('sets the alarm to the next moment something is due', async () => {
    const { storage, now, runtime, host, guest } = await readyRoom();
    expect(storage.alarm).toBe(now() + LIMITS.idleTtlMs);
    await runtime.closed(host);
    await runtime.closed(guest);
    expect(storage.alarm).toBe(now() + LIMITS.disconnectedTtlMs);
  });

  it('ends a room that nobody has been in for a while: sockets closed, storage emptied, no alarm', async () => {
    const { runtime, storage, advance, host, guest, wake, open } = await readyRoom();
    await runtime.closed(host);
    await runtime.closed(guest);
    advance(LIMITS.disconnectedTtlMs);
    await wake().alarm();
    expect(storage.saved).toBeUndefined();
    expect(storage.alarm).toBeNull();
    const late = open('c9');
    await wake().connect(late);
    expect(late.errors()).toEqual(['room-not-found']);
  });

  it('ends a room where nothing happens for hours, closing the sockets that are still open', async () => {
    const { storage, advance, host, guest, wake } = await readyRoom();
    advance(LIMITS.idleTtlMs);
    await wake().alarm();
    expect(host.closedWith?.reason).toBe('room-closed');
    expect(guest.closedWith?.reason).toBe('room-closed');
    expect(storage.saved).toBeUndefined();
  });

  it('passes the host role on after a long absence', async () => {
    const { runtime, advance, host, guest, wake } = await readyRoom();
    await runtime.closed(host);
    advance(LIMITS.hostGraceMs);
    await wake().alarm();
    expect((guest.last('room') as { room: { you: { host: boolean } } }).room.you.host).toBe(true);
  });
});

describe('a room that breaks', () => {
  it('is closed, and the object keeps working', async () => {
    const real = findLogic('le-curseur') as ErasedGameLogic;
    const broken: ErasedGameLogic = {
      ...real,
      view: () => {
        throw new Error('view crashed');
      },
    };
    const env = setup((id) => (id === 'le-curseur' ? broken : undefined));
    const runtime = env.wake();
    await runtime.create(request);
    const host = env.open('c1');
    const guest = env.open('c2');
    await join(runtime, host, 'Ann', HOST_TOKEN);
    await join(runtime, guest, 'Bob');
    await send(runtime, host, { type: 'seat', seat: 0 });
    await send(runtime, guest, { type: 'seat', seat: 1 });
    await send(runtime, host, { type: 'start' });
    expect(env.log.join('\n')).toContain('view crashed');
    expect(host.closedWith?.reason).toBe('room-closed');
    expect(env.storage.saved).toBeUndefined();
  });
});
