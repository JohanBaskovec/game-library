import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  Client,
  closeAllClients,
  createRoom,
  defineHostConformance,
  post,
  type HostAddress,
} from '@game-library/host-conformance';
import { findLogic } from '@game-library/registry/logics';
import { LIMITS } from '@game-library/room';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY } from './http.ts';
import { startServer, type RunningServer, type ServerOptions } from './server.ts';
import { FakeClock } from './testing.ts';

const CATALOG = [
  { id: 'le-curseur', rulesVersion: 1, seatCount: 2, singleDevice: true, contentLocales: ['fr'] },
];

const running: RunningServer[] = [];

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
  closeAllClients();
  for (const server of running.splice(0)) await server.close();
});

const base = (server: RunningServer) => `http://127.0.0.1:${server.port}`;
const address = (server: RunningServer): HostAddress => ({
  http: base(server),
  ws: `ws://127.0.0.1:${server.port}`,
});

describe('what only this host does with sockets', () => {
  it('limits how fast one socket may send, then closes it', async () => {
    const server = await start({
      limits: { messagesBurst: 3, messagesPerSecond: 0.001 },
      clock: new FakeClock(),
    });
    const room = await createRoom(address(server));
    const client = await Client.open(address(server), room.code);
    client.join('Ann', room.token);
    await client.next('joined');
    for (let i = 0; i < 12; i++) client.send({ type: 'seat', seat: 0 });
    expect((await client.next('error')).code).toBe('rate-limited');
    expect((await client.untilClosed()).code).toBe(1008);
  });

  it('drops a socket that never says who it is', async () => {
    const clock = new FakeClock();
    const server = await start({ clock });
    const room = await createRoom(address(server));
    const client = await Client.open(address(server), room.code);
    await new Promise((resolve) => setTimeout(resolve, 50));
    clock.advance(LIMITS.joinTimeoutMs);
    expect((await client.untilClosed()).reason).toBe('not-joined');
  });

  it('forgets a room after the delay, closing its sockets', async () => {
    const clock = new FakeClock();
    const server = await start({ clock });
    const room = await createRoom(address(server));
    const client = await Client.open(address(server), room.code);
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
    expect((await post(address(server), { gameId: 'le-curseur' })).status).toBe(201);
    expect((await post(address(server), { gameId: 'le-curseur' })).status).toBe(201);
    expect(await post(address(server), { gameId: 'le-curseur' })).toMatchObject({
      status: 429,
      body: { error: 'rate-limited' },
    });
  });

  it('limits the total number of rooms', async () => {
    const server = await start({ maxRooms: 1 });
    expect((await post(address(server), { gameId: 'le-curseur' })).status).toBe(201);
    expect(await post(address(server), { gameId: 'le-curseur' })).toMatchObject({
      status: 503,
      body: { error: 'too-many-rooms' },
    });
  });

  it('limits how many sockets one address can hold open', async () => {
    const server = await start({ limits: { socketsPerAddress: 2 } });
    const room = await createRoom(address(server));
    const first = await Client.open(address(server), room.code);
    const second = await Client.open(address(server), room.code);
    const third = await Client.open(address(server), room.code);
    expect((await third.next('error')).code).toBe('rate-limited');
    expect((await third.untilClosed()).code).toBe(4429);
    // Closing one frees a place.
    first.ws.close();
    await first.untilClosed();
    const fourth = await Client.open(address(server), room.code);
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
      const client = await Client.open(address(server), 'ZZZZZ');
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
      (await post(address(server), { gameId: 'le-curseur' }, { origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
    const allowed = await post(address(server), { gameId: 'le-curseur' }, { origin: good });
    expect(allowed.status).toBe(201);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(good);
    expect(allowed.headers.get('vary')).toBe('Origin');

    const code = (allowed.body as { code: string }).code;
    await expect(Client.open(address(server), code, 'https://evil.example')).rejects.toThrow(
      'HTTP 403',
    );
    await Client.open(address(server), code, good);
  });

  it('lets a client without an origin through (not a browser)', async () => {
    const server = await start({ allowedOrigins: [good] });
    expect((await post(address(server), { gameId: 'le-curseur' })).status).toBe(201);
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
    await writeFile(path.join(dist, '_headers'), '/*\n  X-Test: hidden');
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

  it('does not publish the file that only configures Cloudflare', async () => {
    const server = await start({ clientDist: dist });
    const result = await raw(server, '/_headers');
    expect(result.status).toBe(404);
    expect(result.body).not.toContain('hidden');
  });

  it('sends the same content security policy as the headers file of the Cloudflare host', async () => {
    const file = await readFile(
      path.resolve(import.meta.dirname, '../../client/public/_headers'),
      'utf8',
    );
    expect(file).toContain(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}\n`);
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
    const room = await createRoom(address(server));
    const client = await Client.open(address(server), room.code);
    client.join('Ann', room.token);
    await client.next('joined');
    await server.close();
    running.splice(running.indexOf(server), 1);
    await client.untilClosed();
    await expect(fetch(`${base(server)}/api/health`)).rejects.toThrow();
  });
});

// Everything every host must do the same way, on this host, with real sockets.
let conformanceRoot: string;
let conformanceServer: RunningServer | null = null;

defineHostConformance({
  name: 'Node.js host',
  pageContains: 'Conformance home',
  async start() {
    conformanceRoot = await mkdtemp(path.join(os.tmpdir(), 'gl-conformance-'));
    await writeFile(
      path.join(conformanceRoot, 'index.html'),
      '<!doctype html><title>Conformance home</title>',
    );
    // Many tests make rooms from one address: lift the limits that protect a real server.
    conformanceServer = await startServer({
      port: 0,
      env: { game: findLogic },
      catalog: CATALOG,
      clientDist: conformanceRoot,
      limits: {
        roomsPerAddressBurst: 100_000,
        roomsPerAddressPerMinute: 100_000,
        socketsPerAddress: 100_000,
        unknownRoomsPerAddressBurst: 100_000,
        messagesBurst: 1000,
      },
    });
    const server = conformanceServer;
    return {
      ...address(server),
      stop: async () => {
        await server.close();
        await rm(conformanceRoot, { recursive: true, force: true });
      },
    };
  },
});
