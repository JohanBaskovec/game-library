import type { ErasedGameLogic } from '@game-library/game-kit';
import { findLogic } from '@game-library/registry/logics';
import { LIMITS, PROTOCOL_VERSION } from '@game-library/room';
import { describe, expect, it } from 'vitest';
import { RoomManager } from './rooms.ts';
import { FakeClock, FakeSocket } from './testing.ts';

const env = { game: findLogic };
const CONFIG = { teamNames: ['Blue', 'Orange'], roundCount: 1, contentLocale: 'fr' };

function setup(options: { maxRooms?: number; randomInt?: (max: number) => number } = {}) {
  const clock = new FakeClock();
  const log: string[] = [];
  const manager = new RoomManager({ env, clock, log: (line) => log.push(line), ...options });
  return { clock, manager, log };
}

function createRoom(manager: RoomManager, config: unknown = CONFIG) {
  const result = manager.create({ gameId: 'le-curseur', config });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('creating rooms', () => {
  it('gives a code and a secret, and keeps the room', () => {
    const { manager, log } = setup();
    const room = createRoom(manager);
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(room.token).toMatch(/^[0-9a-f]{32}$/);
    expect(manager.has(room.code)).toBe(true);
    expect(manager.roomCount).toBe(1);
    expect(log.join('\n')).not.toContain(room.token);
  });

  it('refuses an unknown game, and a game the creator has other rules for', () => {
    const { manager } = setup();
    expect(manager.create({ gameId: 'nope' })).toEqual({ ok: false, error: 'unknown-game' });
    expect(manager.create({ gameId: 'le-curseur', rules: 99 })).toEqual({
      ok: false,
      error: 'rules-mismatch',
    });
    expect(manager.roomCount).toBe(0);
  });

  it('stops at the maximum number of rooms', () => {
    const { manager } = setup({ maxRooms: 2 });
    createRoom(manager);
    createRoom(manager);
    expect(manager.create({ gameId: 'le-curseur' })).toEqual({
      ok: false,
      error: 'too-many-rooms',
    });
  });

  it('never gives two rooms the same code', () => {
    let calls = 0;
    // The first room draws AAAAA; the second is first offered AAAAA again, then something else.
    const randomInt = (max: number) => (calls++ < 10 ? 0 : calls % max);
    const { manager } = setup({ randomInt });
    const first = createRoom(manager);
    const second = createRoom(manager);
    expect(first.code).toBe('AAAAA');
    expect(second.code).not.toBe(first.code);
    expect(manager.roomCount).toBe(2);
  });

  it('gives up rather than loop forever when codes keep colliding', () => {
    const { manager } = setup({ randomInt: () => 0 });
    createRoom(manager);
    expect(manager.create({ gameId: 'le-curseur' })).toEqual({
      ok: false,
      error: 'too-many-rooms',
    });
  });
});

describe('sockets', () => {
  it('connects to a room that exists and not to one that does not', () => {
    const { manager } = setup();
    expect(manager.connect('ZZZZZ', new FakeSocket())).toBeNull();
    const room = createRoom(manager);
    expect(manager.connect(room.code, new FakeSocket())).toMatch(/^c\d+$/);
  });

  it('turns the engine’s messages into JSON for the right socket', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    const host = new FakeSocket();
    const conn = manager.connect(room.code, host) as string;
    manager.message(room.code, conn, {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name: 'Ann',
      token: room.token,
    });
    expect(host.sent.map((message) => (message as { type: string }).type)).toEqual([
      'joined',
      'room',
    ]);
    expect(host.messages('joined')[0]).toMatchObject({ token: room.token });

    const guest = new FakeSocket();
    const guestConn = manager.connect(room.code, guest) as string;
    manager.message(room.code, guestConn, {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name: 'Bob',
    });
    expect(host.messages('room')).toHaveLength(2);
    expect(guest.messages('joined')).toHaveLength(1);
  });

  it('tells the others when a socket goes away, and ignores a second report of it', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    const host = new FakeSocket();
    const guest = new FakeSocket();
    const hostConn = manager.connect(room.code, host) as string;
    manager.message(room.code, hostConn, {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name: 'Ann',
      token: room.token,
    });
    const guestConn = manager.connect(room.code, guest) as string;
    manager.message(room.code, guestConn, {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name: 'Bob',
    });

    manager.disconnect(room.code, guestConn);
    const members = (
      host.messages('room').at(-1) as { room: { members: { name: string; connected: boolean }[] } }
    ).room.members;
    expect(members.find((member) => member.name === 'Bob')?.connected).toBe(false);

    const before = host.sent.length;
    manager.disconnect(room.code, guestConn);
    manager.disconnect(room.code, 'c999');
    manager.disconnect('ZZZZZ', 'c1');
    expect(host.sent.length).toBe(before);
  });

  it('closes a socket the engine closes, and does not treat its later close as news', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    const socket = new FakeSocket();
    const conn = manager.connect(room.code, socket) as string;
    manager.message(room.code, conn, { type: 'join', protocol: 99, name: 'Old app' });
    expect(socket.messages('error')).toEqual([{ type: 'error', code: 'protocol-mismatch' }]);
    expect(socket.closedWith).toBe('protocol-mismatch');
    expect(() => manager.disconnect(room.code, conn)).not.toThrow();
  });
});

describe('time', () => {
  it('drops a socket that never says who it is', () => {
    const { manager, clock } = setup();
    const room = createRoom(manager);
    const socket = new FakeSocket();
    manager.connect(room.code, socket);
    clock.advance(LIMITS.joinTimeoutMs - 1);
    expect(socket.closedWith).toBeNull();
    clock.advance(1);
    expect(socket.closedWith).toBe('not-joined');
  });

  it('deletes a room nobody ever joined', () => {
    const { manager, clock, log } = setup();
    const room = createRoom(manager);
    clock.advance(LIMITS.disconnectedTtlMs);
    expect(manager.has(room.code)).toBe(false);
    expect(manager.roomCount).toBe(0);
    expect(log.some((line) => line.startsWith('room expired'))).toBe(true);
  });

  it('keeps a room while people are in it, then deletes it when nothing happens for hours', () => {
    const { manager, clock } = setup();
    const room = createRoom(manager);
    const socket = new FakeSocket();
    const conn = manager.connect(room.code, socket) as string;
    manager.message(room.code, conn, {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name: 'Ann',
      token: room.token,
    });
    clock.advance(LIMITS.idleTtlMs - 1);
    expect(manager.has(room.code)).toBe(true);
    clock.advance(1);
    expect(manager.has(room.code)).toBe(false);
    expect(socket.closedWith).toBe('room-closed');
  });

  it('leaves no timer running once a room is gone', () => {
    const { manager, clock } = setup();
    createRoom(manager);
    createRoom(manager);
    expect(clock.pendingTimers).toBe(2);
    clock.advance(LIMITS.disconnectedTtlMs);
    expect(manager.roomCount).toBe(0);
    expect(clock.pendingTimers).toBe(0);
  });

  it('closes everything and stops all timers when it is stopped', () => {
    const { manager, clock } = setup();
    const room = createRoom(manager);
    const socket = new FakeSocket();
    manager.connect(room.code, socket);
    manager.closeAll();
    expect(socket.closedWith).toBe('server-stopping');
    expect(manager.roomCount).toBe(0);
    expect(clock.pendingTimers).toBe(0);
  });
});

describe('a room that breaks', () => {
  it('is closed without taking the other rooms with it', () => {
    const broken: ErasedGameLogic = {
      ...(findLogic('le-curseur') as ErasedGameLogic),
      id: 'broken',
      view: () => {
        throw new Error('view crashed');
      },
    };
    const clock = new FakeClock();
    const log: string[] = [];
    const manager = new RoomManager({
      env: { game: (id) => (id === 'broken' ? broken : findLogic(id)) },
      clock,
      log: (line) => log.push(line),
    });
    const good = manager.create({ gameId: 'le-curseur', config: CONFIG });
    const bad = manager.create({ gameId: 'broken', config: CONFIG });
    if (!good.ok || !bad.ok) throw new Error('could not create rooms');

    const goodSocket = new FakeSocket();
    const goodConn = manager.connect(good.code, goodSocket) as string;
    manager.message(good.code, goodConn, {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name: 'Ann',
      token: good.token,
    });

    const badSocket = new FakeSocket();
    const badConn = manager.connect(bad.code, badSocket) as string;
    manager.message(bad.code, badConn, {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name: 'Bob',
      token: bad.token,
    });
    const otherSocket = new FakeSocket();
    const otherConn = manager.connect(bad.code, otherSocket) as string;
    manager.message(bad.code, otherConn, { type: 'join', protocol: PROTOCOL_VERSION, name: 'Cy' });
    manager.message(bad.code, badConn, { type: 'seat', seat: 0 });
    manager.message(bad.code, otherConn, { type: 'seat', seat: 1 });
    // Both seats are taken: starting builds the first views, and the broken game crashes there.
    manager.message(bad.code, badConn, { type: 'start' });

    // The crash happens while building a view; the room is closed, the other room still works.
    expect(log.join('\n')).toContain('view crashed');
    expect(manager.has(bad.code)).toBe(false);
    expect(badSocket.closedWith).toBe('room-closed');
    expect(otherSocket.closedWith).toBe('room-closed');
    expect(manager.has(good.code)).toBe(true);
    manager.message(good.code, goodConn, { type: 'seat', seat: 0 });
    expect(goodSocket.messages('room').length).toBeGreaterThan(1);
  });
});
