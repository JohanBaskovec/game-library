import { describe, expect, it, vi } from 'vitest';
import { RemoteSession, type Schedule, type SocketLike } from './session.svelte.ts';

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: ((code: number, reason: string) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.closed = true;
  }

  // What the test does to the socket.
  open(): void {
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.(JSON.stringify(message));
  }

  drop(code = 1006, reason = ''): void {
    this.onclose?.(code, reason);
  }
}

function harness(overrides: { token?: string | null; random?: () => number } = {}) {
  const sockets: FakeSocket[] = [];
  const timers: { callback: () => void; ms: number; cancelled: boolean }[] = [];
  const schedule: Schedule = (callback, ms) => {
    const timer = { callback, ms, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  const onToken = vi.fn();
  const onGone = vi.fn();
  const session = new RemoteSession({
    code: 'K7M2P',
    wsBase: 'wss://games.example',
    name: 'Ann',
    token: overrides.token ?? null,
    rules: 1,
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    schedule,
    random: overrides.random ?? (() => 0.5),
    onToken,
    onGone,
  });
  /** The latest socket, opened and joined. */
  const join = (token = 'secret') => {
    const socket = sockets.at(-1) as FakeSocket;
    socket.open();
    socket.receive({ type: 'joined', token, deviceId: 'dev1' });
    return socket;
  };
  const pending = () => timers.filter((timer) => !timer.cancelled);
  return { session, sockets, timers, onToken, onGone, join, pending };
}

const lobbyRoom = (v: number, extra: Record<string, unknown> = {}) => ({
  type: 'room',
  v,
  room: {
    code: 'K7M2P',
    phase: 'lobby',
    members: [],
    you: { id: 'dev1', seat: null, host: true },
    ...extra,
  },
});

describe('joining', () => {
  it('opens the room’s socket and says who it is when it opens', () => {
    const { session, sockets } = harness();
    session.connect();
    expect(sockets[0]?.url).toBe('wss://games.example/api/rooms/K7M2P/ws');
    expect(session.status).toBe('connecting');
    sockets[0]?.open();
    expect(sockets[0]?.sent).toEqual([{ type: 'join', protocol: 1, name: 'Ann', rules: 1 }]);
  });

  it('shows the token it has from an earlier visit', () => {
    const { session, sockets } = harness({ token: 'old-secret' });
    session.connect();
    sockets[0]?.open();
    expect(sockets[0]?.sent[0]).toMatchObject({ token: 'old-secret' });
  });

  it('is open once the server has accepted it, and hands the new secret to be kept', () => {
    const { session, join, onToken } = harness();
    session.connect();
    join('new-secret');
    expect(session.status).toBe('open');
    expect(onToken).toHaveBeenCalledWith('new-secret');
  });
});

describe('what the server sends', () => {
  it('keeps the latest room and view', () => {
    const { session, join } = harness();
    session.connect();
    const socket = join();
    socket.receive(lobbyRoom(2));
    expect(session.room?.phase).toBe('lobby');
    socket.receive({ ...lobbyRoom(3), room: { ...lobbyRoom(3).room, phase: 'playing' } });
    socket.receive({
      type: 'view',
      v: 3,
      seat: 1,
      actingSeat: 0,
      over: false,
      view: { secret: false },
    });
    expect(session.room?.phase).toBe('playing');
    expect(session.play).toEqual({ seat: 1, actingSeat: 0, over: false, view: { secret: false } });
  });

  it('ignores a message older than what it already shows', () => {
    const { session, join } = harness();
    session.connect();
    const socket = join();
    socket.receive(lobbyRoom(5, { configError: 'new' }));
    socket.receive(lobbyRoom(4, { configError: 'old' }));
    expect((session.room as unknown as { configError: string }).configError).toBe('new');
    socket.receive({ type: 'view', v: 6, seat: 0, actingSeat: 0, over: false, view: 'new' });
    socket.receive({ type: 'view', v: 2, seat: 0, actingSeat: 0, over: false, view: 'old' });
    expect(session.play?.view).toBe('new');
  });

  it('forgets the game when the room goes back to the lobby', () => {
    const { session, join } = harness();
    session.connect();
    const socket = join();
    socket.receive({ type: 'view', v: 2, seat: 0, actingSeat: 0, over: false, view: {} });
    expect(session.play).not.toBeNull();
    socket.receive(lobbyRoom(3));
    expect(session.play).toBeNull();
  });

  it('notes an action the game refused, until the next view', () => {
    const { session, join } = harness();
    session.connect();
    const socket = join();
    socket.receive({ type: 'refused', error: 'wrong-seat' });
    expect(session.refused).toBe('wrong-seat');
    socket.receive({ type: 'view', v: 9, seat: 0, actingSeat: 0, over: false, view: {} });
    expect(session.refused).toBeNull();
  });

  it('notes a problem that does not end the session', () => {
    const { session, join } = harness();
    session.connect();
    const socket = join();
    socket.receive({ type: 'error', code: 'not-host' });
    expect(session.problem).toBe('not-host');
    expect(session.error).toBeNull();
    expect(session.status).toBe('open');
  });

  it('ignores what is not JSON', () => {
    const { session, sockets } = harness();
    session.connect();
    sockets[0]?.open();
    expect(() => sockets[0]?.onmessage?.('{broken')).not.toThrow();
    expect(session.status).toBe('connecting');
  });
});

describe('sending', () => {
  it('sends seats, settings, start, actions and reset once open', () => {
    const { session, join } = harness();
    session.connect();
    const socket = join();
    socket.sent.length = 0;
    expect(session.takeSeat(1)).toBe(true);
    expect(session.takeSeat(null)).toBe(true);
    expect(session.setConfig({ a: 1 })).toBe(true);
    expect(session.start()).toBe(true);
    expect(session.act({ type: 'clue' })).toBe(true);
    expect(session.reset()).toBe(true);
    expect(socket.sent).toEqual([
      { type: 'seat', seat: 1 },
      { type: 'seat', seat: null },
      { type: 'config', config: { a: 1 } },
      { type: 'start' },
      { type: 'action', action: { type: 'clue' } },
      { type: 'reset' },
    ]);
  });

  it('refuses to send while not connected, and says so', () => {
    const { session, sockets, join } = harness();
    session.connect();
    expect(session.act({})).toBe(false); // not joined yet
    join();
    sockets[0]?.drop();
    expect(session.status).toBe('reconnecting');
    expect(session.act({})).toBe(false);
    expect(session.start()).toBe(false);
  });
});

describe('losing the connection', () => {
  it('reconnects by itself, with the secret it was given, and comes back as the same device', () => {
    const { session, sockets, timers, join, pending } = harness();
    session.connect();
    join('secret-1');
    sockets[0]?.drop();
    expect(session.status).toBe('reconnecting');
    expect(pending()).toHaveLength(1);

    timers[0]?.callback();
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(sockets[1]?.sent[0]).toMatchObject({ type: 'join', token: 'secret-1' });
    sockets[1]?.receive({ type: 'joined', token: 'secret-1', deviceId: 'dev1' });
    expect(session.status).toBe('open');
  });

  it('waits longer after each failure, up to a limit, and starts over after a success', () => {
    const { session, sockets, timers, join } = harness({ random: () => 0.5 });
    session.connect();
    join();
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) {
      (sockets.at(-1) as FakeSocket).drop();
      delays.push(timers.at(-1)?.ms ?? 0);
      timers.at(-1)?.callback();
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);

    join();
    (sockets.at(-1) as FakeSocket).drop();
    expect(timers.at(-1)?.ms).toBe(500);
  });

  it('adds a little randomness to the wait', () => {
    const low = harness({ random: () => 0 });
    low.session.connect();
    low.join();
    low.sockets[0]?.drop();
    expect(low.timers[0]?.ms).toBe(400);
    const high = harness({ random: () => 1 });
    high.session.connect();
    high.join();
    high.sockets[0]?.drop();
    expect(high.timers[0]?.ms).toBe(600);
  });

  it('tries again at once when nudged, and does nothing when it is connected', () => {
    const { session, sockets, join, pending } = harness();
    session.connect();
    join();
    session.nudge();
    expect(sockets).toHaveLength(1);
    sockets[0]?.drop();
    session.nudge();
    expect(sockets).toHaveLength(2);
    expect(pending()).toHaveLength(0);
  });

  it('ignores a socket it has already replaced', () => {
    const { session, sockets, timers, join } = harness();
    session.connect();
    join();
    sockets[0]?.drop();
    timers[0]?.callback();
    sockets[0]?.receive({ type: 'error', code: 'room-not-found' });
    sockets[0]?.drop();
    expect(session.error).toBeNull();
    expect(session.status).toBe('reconnecting');
  });
});

describe('ending for good', () => {
  it.each([
    'room-not-found',
    'protocol-mismatch',
    'rules-mismatch',
    'room-full',
    'bad-name',
    'room-closed',
  ])('does not retry after "%s"', (code) => {
    const { session, sockets, pending } = harness();
    session.connect();
    sockets[0]?.open();
    sockets[0]?.receive({ type: 'error', code });
    expect(session.error).toBe(code);
    expect(session.status).toBe('closed');
    expect(sockets[0]?.closed).toBe(true);
    sockets[0]?.drop(1000, code);
    expect(pending()).toHaveLength(0);
    expect(sockets).toHaveLength(1);
  });

  it('forgets the secret when the room is gone', () => {
    const missing = harness();
    missing.session.connect();
    missing.sockets[0]?.receive({ type: 'error', code: 'room-not-found' });
    expect(missing.onGone).toHaveBeenCalledWith('room-not-found');

    const closed = harness();
    closed.session.connect();
    closed.join();
    closed.sockets[0]?.drop(1000, 'room-closed');
    expect(closed.session.error).toBe('room-closed');
    expect(closed.onGone).toHaveBeenCalledWith('room-closed');
  });

  it('keeps the secret when the app and the server merely disagree', () => {
    const { session, sockets, onGone } = harness();
    session.connect();
    sockets[0]?.receive({ type: 'error', code: 'protocol-mismatch' });
    expect(session.error).toBe('protocol-mismatch');
    expect(onGone).not.toHaveBeenCalled();
  });

  it('leaves the room: says so, forgets the secret, closes, and does not come back', () => {
    const { session, sockets, onGone, pending } = harness();
    session.connect();
    const socket = sockets[0] as FakeSocket;
    socket.open();
    socket.receive({ type: 'joined', token: 't', deviceId: 'd' });
    session.leave();
    expect(socket.sent.at(-1)).toEqual({ type: 'leave' });
    expect(onGone).toHaveBeenCalledWith('left');
    expect(socket.closed).toBe(true);
    expect(session.status).toBe('closed');
    socket.drop(1000, 'left');
    expect(pending()).toHaveLength(0);
    expect(sockets).toHaveLength(1);
  });

  it('closes without leaving: the device stays a member and can come back', () => {
    const { session, join, onGone, pending, sockets } = harness();
    session.connect();
    const socket = join();
    session.close();
    expect(socket.sent.some((message) => message.type === 'leave')).toBe(false);
    expect(onGone).not.toHaveBeenCalled();
    socket.drop();
    expect(pending()).toHaveLength(0);
    expect(sockets).toHaveLength(1);
    expect(session.status).toBe('closed');
  });

  it('cancels a pending retry when closed', () => {
    const { session, join, sockets, pending } = harness();
    session.connect();
    join();
    sockets[0]?.drop();
    expect(pending()).toHaveLength(1);
    session.close();
    expect(pending()).toHaveLength(0);
  });
});
