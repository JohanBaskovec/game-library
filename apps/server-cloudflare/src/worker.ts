import { buildCatalog } from '@game-library/registry/logics';
import {
  MAX_REQUEST_BYTES,
  catalogReply,
  createRoomReply,
  createRoomStatus,
  generateRoomCode,
  normalizeRoomCode,
  parseCreateRoomRequest,
  type ServerMessage,
} from '@game-library/room';
import { numberFrom, type Env } from './env.ts';

export { LimiterDO } from './limiter-do.ts';
export { RoomDO } from './room-do.ts';

const ROOM_PATH = /^\/api\/rooms\/([^/]+)\/ws$/;
const MAX_CODE_ATTEMPTS = 20;

/** The games this server runs. The versions are those of the rules bundled in this Worker. */
const catalog = buildCatalog();

/** A uniformly random integer in [0, max), without the bias of a remainder. */
function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while ((buffer[0] ?? 0) >= limit);
  return (buffer[0] ?? 0) % max;
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function allowedOrigins(env: Env): readonly string[] | null {
  const list = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return list.length === 0 ? null : list;
}

function originAllowed(request: Request, env: Env): boolean {
  const allowed = allowedOrigins(env);
  const origin = request.headers.get('origin');
  return allowed === null || origin === null || allowed.includes(origin);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = allowedOrigins(env);
  if (allowed === null) return { 'access-control-allow-origin': '*' };
  const origin = request.headers.get('origin');
  if (origin !== null && allowed.includes(origin)) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return {};
}

function json(request: Request, env: Env, status: number, body: unknown): Response {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...corsHeaders(request, env),
    },
  });
}

/** The address of the device, as Cloudflare saw it. */
function addressOf(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

/** One token from a limit of this address. A limiter that cannot answer must not let everything through. */
async function allow(
  env: Env,
  request: Request,
  name: 'create' | 'unknown',
  options: { capacity: number; refillPerSecond: number },
): Promise<boolean> {
  try {
    const stub = env.LIMITER.get(env.LIMITER.idFromName(addressOf(request)));
    return await stub.take(name, options);
  } catch {
    return false;
  }
}

/** Reads a small JSON body. A body that is too large is not read to the end. */
async function readJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: 'too-large' | 'invalid' }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_REQUEST_BYTES) return { ok: false, reason: 'too-large' };
  if (!request.body) return { ok: false, reason: 'invalid' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return { ok: false, reason: 'too-large' };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(all)) };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

async function createRoomResponse(request: Request, env: Env): Promise<Response> {
  if (!originAllowed(request, env)) return json(request, env, 403, { error: 'forbidden-origin' });

  const perMinute = numberFrom(env.ROOMS_PER_ADDRESS_PER_MINUTE, 10);
  const allowed = await allow(env, request, 'create', {
    capacity: numberFrom(env.ROOMS_PER_ADDRESS_BURST, 10),
    refillPerSecond: perMinute / 60,
  });
  if (!allowed) {
    return json(request, env, createRoomStatus('rate-limited'), { error: 'rate-limited' });
  }

  const read = await readJson(request);
  if (!read.ok && read.reason === 'too-large') {
    return json(request, env, createRoomStatus('too-large'), { error: 'too-large' });
  }
  const parsed = read.ok ? parseCreateRoomRequest(read.value) : null;
  if (!parsed) return json(request, env, 400, { error: 'bad-request' });

  const token = randomHex(16);
  const deviceId = randomHex(4);
  // A code that is already a room is rare; the room says so, and another code is drawn.
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode(randomInt);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const outcome = await stub.create({
      code,
      gameId: parsed.gameId,
      ...(parsed.rules === undefined ? {} : { rules: parsed.rules }),
      config: parsed.config,
      token,
      deviceId,
    });
    if (outcome.ok) return json(request, env, 201, createRoomReply(code, token));
    if (outcome.error !== 'exists') {
      return json(request, env, createRoomStatus(outcome.error), { error: outcome.error });
    }
  }
  return json(request, env, createRoomStatus('too-many-rooms'), { error: 'too-many-rooms' });
}

/** A WebSocket that only says why it was refused, as the Node.js host does. */
function refusedSocket(code: 'room-not-found' | 'rate-limited', closeCode: number): Response {
  const pair = new WebSocketPair();
  const server = pair[1];
  server.accept();
  server.send(JSON.stringify({ type: 'error', code } satisfies ServerMessage));
  server.close(closeCode, code);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

async function connectResponse(request: Request, env: Env, rawCode: string): Promise<Response> {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return json(request, env, 426, { error: 'upgrade-required' });
  }
  if (!originAllowed(request, env)) return new Response(null, { status: 403 });

  let decoded = rawCode;
  try {
    decoded = decodeURIComponent(rawCode);
  } catch {
    // Left as it is: it will not be a room code.
  }
  const code = normalizeRoomCode(decoded);
  if (code !== null) {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const response = await stub.fetch(request);
    if (response.status !== 404) return response;
  }
  // Guessing codes is what an attacker would do: that is what is limited.
  const allowed = await allow(env, request, 'unknown', {
    capacity: numberFrom(env.UNKNOWN_ROOMS_PER_ADDRESS_BURST, 20),
    refillPerSecond: 20 / 60,
  });
  return allowed ? refusedSocket('room-not-found', 4404) : refusedSocket('rate-limited', 4404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // Only /api/* reaches the Worker: the website's files are served by Cloudflare itself.
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(request, env),
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
        },
      });
    }
    if (url.pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
      return json(request, env, 200, { ok: true });
    }
    if (url.pathname === '/api/catalog' && (method === 'GET' || method === 'HEAD')) {
      return json(request, env, 200, catalogReply(catalog));
    }
    if (url.pathname === '/api/rooms' && method === 'POST') {
      return createRoomResponse(request, env);
    }
    const match = ROOM_PATH.exec(url.pathname);
    if (match && method === 'GET') return connectResponse(request, env, match[1] ?? '');
    return json(request, env, 404, { error: 'not-found' });
  },
} satisfies ExportedHandler<Env>;
