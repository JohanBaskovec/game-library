import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { findLogic } from '@game-library/registry/logics';
import { LIMITS, PROTOCOL_VERSION } from '@game-library/room';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer, type ServerOptions } from './server.ts';
import { FakeClock } from './testing.ts';

type Json = Record<string, unknown>;

const CATALOG = [
  { id: 'le-curseur', rulesVersion: 1, seatCount: 2, singleDevice: true, contentLocales: ['fr'] },
];
const CONFIG = { teamNames: ['Blue', 'Orange'], roundCount: 1, contentLocale: 'fr' };

const running: RunningServer[] = [];
const sockets: WebSocket[] = [];

async function start(overrides: Partial<ServerOptions> = {}): Promise<RunningServer> {
  const server = await startServer({
    port: 0,
    env: { game: findLogic },
    catalog: CATALOG,
    ...overrides,
  });
  running.push(server);
  return server;
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const server of running.splice(0)) await server.close();
});

const base = (server: RunningServer) => `http://127.0.0.1:${server.port}`;

async function post(server: RunningServer, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${base(server)}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Json,
    headers: response.headers,
  };
}

async function createRoom(server: RunningServer, config: unknown = CONFIG) {
  const result = await post(server, { gameId: 'le-curseur', config });
  expect(result.status).toBe(201);
  return result.body as { code: string; token: string; protocol: number };
}

/** A device connected to a room over a real WebSocket. */
class Client {
  readonly messages: Json[] = [];
  closed: { code: number; reason: string } | null = null;
  private readonly waiters: (() => void)[] = [];

  readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    sockets.push(ws);
    ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()) as Json);
      this.waiters.splice(0).forEach((wake) => wake());
    });
    ws.on('close', (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }

  static async open(server: RunningServer, code: string, origin?: string): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/rooms/${code}/ws`, {
      ...(origin === undefined ? {} : { origin }),
    });
    const client = new Client(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
      ws.once('unexpected-response', (_request, response) =>
        reject(new Error(`HTTP ${response.statusCode}`)),
      );
    });
    return client;
  }

  send(message: unknown): void {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  join(name: string, token?: string): void {
    this.send({ type: 'join', protocol: PROTOCOL_VERSION, name, ...(token ? { token } : {}) });
  }

  /** Resolves with the first message (already received, or yet to come) that satisfies `test`. */
  async until(test: (message: Json) => boolean, description = 'a message'): Promise<Json> {
    const deadline = Date.now() + 5000;
    for (;;) {
      const found = this.messages.find(test);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out waiting for ${description}. Received: ${JSON.stringify(this.messages).slice(0, 600)}`,
        );
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  async next(type: string): Promise<Json> {
    return this.until((message) => message.type === type, `a "${type}" message`);
  }

  async untilClosed(): Promise<{ code: number; reason: string }> {
    const deadline = Date.now() + 5000;
    while (this.closed === null) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for the socket to close');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
    return this.closed;
  }

  all(type: string): Json[] {
    return this.messages.filter((message) => message.type === type);
  }

  last(type: string): Json | undefined {
    return this.all(type).at(-1);
  }
}

type RoomMessage = {
  room: {
    phase: string;
    members: { name: string; seat: number | null; connected: boolean }[];
    you: { host: boolean; seat: number | null };
  };
};
type ViewMessage = { seat: number; actingSeat: number; over: boolean; view: Json };

/** A room with a host in seat 0 and a guest in seat 1, joined and seated. */
async function seatedRoom(server: RunningServer) {
  const room = await createRoom(server);
  const host = await Client.open(server, room.code);
  host.join('Ann', room.token);
  await host.next('joined');
  const guest = await Client.open(server, room.code);
  guest.join('Bob');
  const guestJoined = await guest.next('joined');
  host.send({ type: 'seat', seat: 0 });
  guest.send({ type: 'seat', seat: 1 });
  await host.until(
    (m) =>
      m.type === 'room' && (m as unknown as RoomMessage).room.members.every((x) => x.seat !== null),
  );
  return { room, host, guest, guestToken: guestJoined.token as string };
}

describe('the HTTP API', () => {
  it('says it is alive and lists the games with their versions', async () => {
    const server = await start();
    const health = await fetch(`${base(server)}/api/health`);
    expect(await health.json()).toEqual({ ok: true, rooms: 0 });

    const catalog = (await (await fetch(`${base(server)}/api/catalog`)).json()) as Json;
    expect(catalog.protocol).toBe(PROTOCOL_VERSION);
    expect(catalog.games).toEqual(CATALOG);
    expect(catalog.limits).toEqual({
      maxDevices: LIMITS.maxDevices,
      maxNameLength: LIMITS.maxNameLength,
    });
  });

  it('creates a room and returns its code, the host’s secret and the protocol version', async () => {
    const server = await start();
    const { status, body, headers } = await post(server, {
      gameId: 'le-curseur',
      rules: 1,
      config: CONFIG,
    });
    expect(status).toBe(201);
    expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    expect(body.protocol).toBe(PROTOCOL_VERSION);
    expect(headers.get('cache-control')).toBe('no-store');
    expect(server.manager.roomCount).toBe(1);
  });

  it('refuses requests it cannot use, with the right status', async () => {
    const server = await start();
    expect((await post(server, 'not json')).status).toBe(400);
    expect((await post(server, [])).status).toBe(400);
    expect((await post(server, 'null')).status).toBe(400);
    expect((await post(server, {})).status).toBe(400);
    expect((await post(server, { gameId: 7 })).status).toBe(400);
    expect((await post(server, { gameId: 'le-curseur', rules: 'one' })).status).toBe(400);
    expect(await post(server, { gameId: 'nope' })).toMatchObject({
      status: 404,
      body: { error: 'unknown-game' },
    });
    expect(await post(server, { gameId: 'le-curseur', rules: 99 })).toMatchObject({
      status: 409,
      body: { error: 'rules-mismatch' },
    });
    expect(server.manager.roomCount).toBe(0);
  });

  it('refuses a request body that is too large, with a 413', async () => {
    const server = await start();
    const result = await post(server, {
      gameId: 'le-curseur',
      config: { junk: 'x'.repeat(20_000) },
    });
    expect(result.status).toBe(413);
    expect(server.manager.roomCount).toBe(0);
  });

  it('answers a browser’s preflight request and allows any site to call the API', async () => {
    const server = await start();
    const preflight = await fetch(`${base(server)}/api/rooms`, {
      method: 'OPTIONS',
      headers: { origin: 'https://localhost', 'access-control-request-method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('content-type');
  });

  it('does not know other routes or methods', async () => {
    const server = await start();
    expect((await fetch(`${base(server)}/api/nothing`)).status).toBe(404);
    expect((await fetch(`${base(server)}/api/rooms`)).status).toBe(404);
    expect((await fetch(`${base(server)}/api/health`, { method: 'POST' })).status).toBe(404);
  });
});

describe('playing in a room over real sockets', () => {
  it('plays a whole game, each team seeing only what is its own', async () => {
    const server = await start();
    const { host, guest } = await seatedRoom(server);
    host.send({ type: 'start' });
    const hostView = (await host.next('view')) as unknown as ViewMessage;
    await guest.next('view');

    const hostIsGiver = hostView.actingSeat === 0;
    const giver = hostIsGiver ? host : guest;
    const guesser = hostIsGiver ? guest : host;

    // The giver sees the target; the guesser does not.
    const giverView = giver.last('view') as unknown as ViewMessage;
    const guesserView = guesser.last('view') as unknown as ViewMessage;
    expect(typeof giverView.view.target).toBe('number');
    expect(guesserView.view.target).toBeNull();
    expect(guesserView.view.pair).toBeNull();

    giver.send({ type: 'action', action: { type: 'clue', text: 'banana' } });
    const guessing = (await guesser.until(
      (m) => m.type === 'view' && (m as unknown as ViewMessage).view.phase === 'guess',
    )) as unknown as ViewMessage;
    expect(guessing.view.clue).toBe('banana');
    expect(guessing.view.target).toBeNull();

    guesser.send({ type: 'action', action: { type: 'guess', position: 50 } });
    const revealed = (await giver.until(
      (m) => m.type === 'view' && (m as unknown as ViewMessage).view.phase === 'reveal',
    )) as unknown as ViewMessage;
    expect(revealed.view.target).toBe(giverView.view.target);
    // Only the team that guessed can move on.
    giver.send({ type: 'action', action: { type: 'continue' } });
    expect((await giver.next('refused')).error).toBe('wrong-seat');
    guesser.send({ type: 'action', action: { type: 'continue' } });

    // Second turn, with the roles swapped, to the recap.
    await giver.until(
      (m) =>
        m.type === 'view' &&
        (m as unknown as ViewMessage).view.phase === 'give' &&
        (m as unknown as ViewMessage).view.turnNumber === 2,
      'the second turn',
    );
    guesser.send({ type: 'action', action: { type: 'clue', text: 'lemon' } });
    giver.send({ type: 'action', action: { type: 'guess', position: 20 } });
    guesser.send({ type: 'action', action: { type: 'continue' } });
    giver.send({ type: 'action', action: { type: 'continue' } });
    const over = (await host.until(
      (m) => m.type === 'view' && (m as unknown as ViewMessage).over === true,
      'the end',
    )) as unknown as ViewMessage;
    expect(over.view.phase).toBe('recap');
    expect(over.view.turns).toHaveLength(2);
    expect((host.last('room') as unknown as RoomMessage).room.phase).toBe('finished');

    // Over the whole game, nothing but views and room descriptions reached a device.
    for (const client of [host, guest]) {
      const everything = JSON.stringify(client.messages);
      expect(everything).not.toContain('"rng"');
      expect(everything).not.toContain('usedPairIndexes');
    }
    // And the guesser of the first turn never held the target while it was still secret.
    for (const message of guesser.all('view')) {
      const view = message as unknown as ViewMessage;
      if (
        view.view.turnNumber === 1 &&
        (view.view.phase === 'give' || view.view.phase === 'guess')
      ) {
        expect(view.view.target).toBeNull();
      }
    }
  });

  it('lets a device that lost its connection come back to its seat and its view', async () => {
    const server = await start();
    const { room, host, guest, guestToken } = await seatedRoom(server);
    host.send({ type: 'start' });
    await guest.next('view');

    guest.ws.terminate();
    await host.until(
      (m) =>
        m.type === 'room' &&
        (m as unknown as RoomMessage).room.members.some((x) => x.name === 'Bob' && !x.connected),
      'Bob going offline',
    );

    const back = await Client.open(server, room.code);
    back.join('Bob', guestToken);
    const roomMessage = (await back.next('room')) as unknown as RoomMessage;
    expect(roomMessage.room.you.seat).toBe(1);
    expect(roomMessage.room.phase).toBe('playing');
    expect(((await back.next('view')) as unknown as ViewMessage).seat).toBe(1);
    await host.until(
      (m) =>
        m.type === 'room' && (m as unknown as RoomMessage).room.members.every((x) => x.connected),
      'Bob back online',
    );
  });

  it('hands the host role on when the host leaves', async () => {
    const server = await start();
    const { host, guest } = await seatedRoom(server);
    host.send({ type: 'leave' });
    expect((await host.untilClosed()).reason).toBe('left');
    const room = (await guest.until(
      (m) => m.type === 'room' && (m as unknown as RoomMessage).room.you.host,
      'the host role',
    )) as unknown as RoomMessage;
    expect(room.room.members.map((member) => member.name)).toEqual(['Bob']);
  });

  it('closes the room when the last device leaves, and then it cannot be joined', async () => {
    const server = await start();
    const room = await createRoom(server);
    const host = await Client.open(server, room.code);
    host.join('Ann', room.token);
    await host.next('joined');
    host.send({ type: 'leave' });
    await host.untilClosed();
    expect(server.manager.has(room.code)).toBe(false);
    const late = await Client.open(server, room.code);
    expect((await late.next('error')).code).toBe('room-not-found');
  });

  it('accepts the code as the players type it', async () => {
    const server = await start();
    const room = await createRoom(server);
    const spaced = room.code.toLowerCase();
    const client = await Client.open(server, spaced);
    client.join('Ann', room.token);
    await client.next('joined');
  });
});

describe('what the socket layer refuses', () => {
  it('tells a device when the room does not exist, and closes', async () => {
    const server = await start();
    for (const code of ['ZZZZZ', 'ab', '!!!!!', 'ABCDEFGH']) {
      const client = await Client.open(server, code);
      expect((await client.next('error')).code).toBe('room-not-found');
      expect((await client.untilClosed()).code).toBe(4404);
    }
  });

  it('answers 404 to a socket on any other path', async () => {
    const server = await start();
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/somewhere/else`);
      sockets.push(ws);
      ws.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
      ws.once('error', () => undefined);
    });
    expect(status).toBe(404);
  });

  it('answers bad messages and closes the socket after five of them', async () => {
    const server = await start();
    const room = await createRoom(server);
    const client = await Client.open(server, room.code);
    client.send('{ not json');
    expect((await client.next('error')).code).toBe('bad-message');
    for (let i = 0; i < 4; i++) client.send('nope');
    expect((await client.untilClosed()).code).toBe(1008);
  });

  it('refuses a binary message', async () => {
    const server = await start();
    const room = await createRoom(server);
    const client = await Client.open(server, room.code);
    client.ws.send(Buffer.from([1, 2, 3]));
    expect((await client.next('error')).code).toBe('bad-message');
  });

  it('closes a socket that sends a message larger than the limit', async () => {
    const server = await start();
    const room = await createRoom(server);
    const client = await Client.open(server, room.code);
    client.send(
      JSON.stringify({
        type: 'config',
        config: { junk: 'x'.repeat(LIMITS.maxMessageBytes + 100) },
      }),
    );
    expect((await client.untilClosed()).code).toBe(1009);
  });

  it('limits how fast one socket may send, then closes it', async () => {
    const server = await start({
      limits: { messagesBurst: 3, messagesPerSecond: 0.001 },
      clock: new FakeClock(),
    });
    const room = await createRoom(server);
    const client = await Client.open(server, room.code);
    client.join('Ann', room.token);
    await client.next('joined');
    for (let i = 0; i < 12; i++) client.send({ type: 'seat', seat: 0 });
    expect((await client.next('error')).code).toBe('rate-limited');
    expect((await client.untilClosed()).code).toBe(1008);
  });

  it('refuses another protocol version and closes', async () => {
    const server = await start();
    const room = await createRoom(server);
    const client = await Client.open(server, room.code);
    client.send({ type: 'join', protocol: 99, name: 'Old' });
    expect((await client.next('error')).code).toBe('protocol-mismatch');
    expect((await client.untilClosed()).reason).toBe('protocol-mismatch');
  });

  it('drops a socket that never says who it is', async () => {
    const clock = new FakeClock();
    const server = await start({ clock });
    const room = await createRoom(server);
    const client = await Client.open(server, room.code);
    await new Promise((resolve) => setTimeout(resolve, 50));
    clock.advance(LIMITS.joinTimeoutMs);
    expect((await client.untilClosed()).reason).toBe('not-joined');
  });

  it('forgets a room after the delay, closing its sockets', async () => {
    const clock = new FakeClock();
    const server = await start({ clock });
    const room = await createRoom(server);
    const client = await Client.open(server, room.code);
    client.join('Ann', room.token);
    await client.next('joined');
    clock.advance(LIMITS.idleTtlMs);
    expect((await client.untilClosed()).reason).toBe('room-closed');
    expect(server.manager.has(room.code)).toBe(false);
  });
});

describe('limits per address', () => {
  it('limits how many rooms one address can create', async () => {
    const server = await start({
      limits: { roomsPerAddressBurst: 2, roomsPerAddressPerMinute: 0.001 },
      clock: new FakeClock(),
    });
    expect((await post(server, { gameId: 'le-curseur' })).status).toBe(201);
    expect((await post(server, { gameId: 'le-curseur' })).status).toBe(201);
    expect(await post(server, { gameId: 'le-curseur' })).toMatchObject({
      status: 429,
      body: { error: 'rate-limited' },
    });
  });

  it('limits the total number of rooms', async () => {
    const server = await start({ maxRooms: 1 });
    expect((await post(server, { gameId: 'le-curseur' })).status).toBe(201);
    expect(await post(server, { gameId: 'le-curseur' })).toMatchObject({
      status: 503,
      body: { error: 'too-many-rooms' },
    });
  });

  it('limits how many sockets one address can hold open', async () => {
    const server = await start({ limits: { socketsPerAddress: 2 } });
    const room = await createRoom(server);
    const first = await Client.open(server, room.code);
    const second = await Client.open(server, room.code);
    const third = await Client.open(server, room.code);
    expect((await third.next('error')).code).toBe('rate-limited');
    expect((await third.untilClosed()).code).toBe(4429);
    // Closing one frees a place.
    first.ws.close();
    await first.untilClosed();
    const fourth = await Client.open(server, room.code);
    fourth.join('Ann', room.token);
    await fourth.next('joined');
    expect(second.closed).toBeNull();
  });

  it('limits guessing at room codes', async () => {
    const server = await start({
      limits: { unknownRoomsPerAddressBurst: 2 },
      clock: new FakeClock(),
    });
    const answers: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      const client = await Client.open(server, 'ZZZZZ');
      answers.push((await client.next('error')).code);
    }
    expect(answers).toEqual(['room-not-found', 'room-not-found', 'rate-limited', 'rate-limited']);
  });
});

describe('origins', () => {
  const good = 'https://good.example';

  it('lets only the listed origins create rooms and open sockets', async () => {
    const server = await start({ allowedOrigins: [good] });
    expect(
      (await post(server, { gameId: 'le-curseur' }, { origin: 'https://evil.example' })).status,
    ).toBe(403);
    const allowed = await post(server, { gameId: 'le-curseur' }, { origin: good });
    expect(allowed.status).toBe(201);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(good);
    expect(allowed.headers.get('vary')).toBe('Origin');

    const code = (allowed.body as { code: string }).code;
    await expect(Client.open(server, code, 'https://evil.example')).rejects.toThrow('HTTP 403');
    await Client.open(server, code, good);
  });

  it('lets a client without an origin through (not a browser)', async () => {
    const server = await start({ allowedOrigins: [good] });
    expect((await post(server, { gameId: 'le-curseur' })).status).toBe(201);
  });

  it('does not send CORS permission to a site that is not listed', async () => {
    const server = await start({ allowedOrigins: [good] });
    const response = await fetch(`${base(server)}/api/health`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

/** A request with the path exactly as written (a normal client would tidy `..` away). */
function raw(
  server: RunningServer,
  requestPath: string,
  method = 'GET',
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port: server.port, path: requestPath, method, agent: false },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (body += chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

describe('serving the website', () => {
  let root: string;
  let dist: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'gl-static-'));
    dist = path.join(root, 'dist');
    await mkdir(path.join(dist, 'assets'), { recursive: true });
    await mkdir(path.join(dist, 'sub'), { recursive: true });
    await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Home</title>');
    await writeFile(path.join(dist, 'sub', 'index.html'), '<!doctype html><title>Sub</title>');
    await writeFile(path.join(dist, 'assets', 'app-1a2b3c.js'), 'console.log(1)');
    await writeFile(path.join(dist, 'assets', 'style-9f.css'), 'body{}');
    await writeFile(path.join(dist, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(path.join(dist, '.secret'), 'hidden');
    await writeFile(path.join(root, 'outside.txt'), 'outside the website');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('serves the page, with a content security policy that allows nothing remote', async () => {
    const server = await start({ clientDist: dist });
    const home = await raw(server, '/');
    expect(home.status).toBe(200);
    expect(home.body).toContain('<title>Home</title>');
    expect(home.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(home.headers['cache-control']).toBe('no-cache');
    expect(home.headers['x-content-type-options']).toBe('nosniff');
    expect(home.headers['x-frame-options']).toBe('DENY');
    const policy = String(home.headers['content-security-policy']);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self' ws: wss:");
    expect(policy).not.toMatch(/https?:\/\//);
    expect((await raw(server, '/index.html')).status).toBe(200);
  });

  it('serves assets with the right type and a long cache, and other files without one', async () => {
    const server = await start({ clientDist: dist });
    const script = await raw(server, '/assets/app-1a2b3c.js');
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(script.headers['content-security-policy']).toBeUndefined();
    expect((await raw(server, '/assets/style-9f.css')).headers['content-type']).toBe(
      'text/css; charset=utf-8',
    );
    const logo = await raw(server, '/logo.svg');
    expect(logo.headers['content-type']).toBe('image/svg+xml');
    expect(logo.headers['cache-control']).toBe('no-cache');
  });

  it('serves a folder’s index page and answers HEAD without a body', async () => {
    const server = await start({ clientDist: dist });
    expect((await raw(server, '/sub/')).body).toContain('<title>Sub</title>');
    expect((await raw(server, '/sub')).body).toContain('<title>Sub</title>');
    const head = await raw(server, '/', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(Number(head.headers['content-length'])).toBeGreaterThan(0);
  });

  it('does not know a file that is not there, and does not rewrite it to the page', async () => {
    const server = await start({ clientDist: dist });
    expect((await raw(server, '/missing.js')).status).toBe(404);
    expect((await raw(server, '/play/le-curseur')).status).toBe(404);
  });

  it('never serves anything outside the website folder, or hidden files', async () => {
    const server = await start({ clientDist: dist });
    for (const attempt of [
      '/../outside.txt',
      '/..%2foutside.txt',
      '/%2e%2e/outside.txt',
      '/%2e%2e%2foutside.txt',
      '/assets/../../outside.txt',
      '/assets/%2e%2e/%2e%2e/outside.txt',
      `/..%5coutside.txt`,
      '/.secret',
      '/%2esecret',
      '/assets/../.secret',
    ]) {
      const result = await raw(server, attempt);
      expect(result.status, attempt).toBe(404);
      expect(result.body, attempt).not.toContain('outside the website');
      expect(result.body, attempt).not.toContain('hidden');
    }
  });

  it('refuses paths with a null byte or broken escapes', async () => {
    const server = await start({ clientDist: dist });
    expect((await raw(server, '/index.html%00.png')).status).toBe(400);
    expect((await raw(server, '/%E0%A4%A')).status).toBe(400);
  });

  it('only answers GET and HEAD for files', async () => {
    const server = await start({ clientDist: dist });
    const result = await raw(server, '/', 'POST');
    expect(result.status).toBe(405);
    expect(result.headers.allow).toBe('GET, HEAD');
  });

  it('serves only the API when there is no website', async () => {
    const server = await start({ clientDist: null });
    expect((await raw(server, '/')).status).toBe(404);
    expect((await raw(server, '/api/health')).status).toBe(200);
  });

  it('does not fail when the website folder does not exist', async () => {
    const server = await start({ clientDist: path.join(root, 'nothing-here') });
    expect((await raw(server, '/')).status).toBe(404);
  });
});

describe('stopping', () => {
  it('closes every socket and stops listening', async () => {
    const server = await start();
    const room = await createRoom(server);
    const client = await Client.open(server, room.code);
    client.join('Ann', room.token);
    await client.next('joined');
    await server.close();
    running.splice(running.indexOf(server), 1);
    await client.untilClosed();
    await expect(fetch(`${base(server)}/api/health`)).rejects.toThrow();
  });
});
