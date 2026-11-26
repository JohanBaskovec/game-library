import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { LIMITS, PROTOCOL_VERSION } from '@game-library/room';
import type { KeyedLimiter } from './limits.ts';
import type { Clock, RoomManager } from './rooms.ts';

export interface CatalogEntry {
  readonly id: string;
  readonly rulesVersion: number;
  readonly seatCount: number;
  readonly singleDevice: boolean;
  readonly contentLocales: readonly string[];
}

export interface HttpOptions {
  readonly manager: RoomManager;
  readonly catalog: readonly CatalogEntry[];
  /** Folder of the built website, or null to serve only the API. */
  readonly clientDist: string | null;
  /** Origins allowed to call the API from a browser, or null for any (there are no cookies to steal). */
  readonly allowedOrigins: readonly string[] | null;
  readonly trustProxy: boolean;
  /** Room creations per address. */
  readonly createLimiter: KeyedLimiter;
  readonly clock: Clock;
}

const MAX_BODY_BYTES = 8 * 1024;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * What the page may load. Everything comes from the site itself; the page may open WebSockets to
 * rooms. Nothing remote, in line with CLAUDE.md rule 5.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** The address of the client. Behind a proxy it is the first address the proxy reports. */
export function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

export function originAllowed(
  origin: string | undefined,
  allowed: readonly string[] | null,
): boolean {
  if (allowed === null || origin === undefined) return true; // Not a browser, or any origin is fine.
  return allowed.includes(origin);
}

function corsHeaders(
  request: IncomingMessage,
  allowed: readonly string[] | null,
): Record<string, string> {
  const origin = request.headers.origin;
  if (allowed === null) return { 'access-control-allow-origin': '*' };
  if (origin !== undefined && allowed.includes(origin)) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return {};
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpOptions,
  status: number,
  body: unknown,
): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...corsHeaders(request, options.allowedOrigins),
  });
  response.end(request.method === 'HEAD' ? undefined : text);
}

type Body =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: 'too-large' | 'invalid' };

/** Reads a small JSON body. A body that is too large is not read to the end. */
function readJson(request: IncomingMessage): Promise<Body> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let finished = false;
    const finish = (body: Body) => {
      if (finished) return;
      finished = true;
      resolve(body);
    };
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0;
        finish({ ok: false, reason: 'too-large' });
        request.pause();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        finish({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        finish({ ok: false, reason: 'invalid' });
      }
    });
    request.on('error', () => finish({ ok: false, reason: 'invalid' }));
  });
}

async function handleCreateRoom(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpOptions,
): Promise<void> {
  if (!originAllowed(request.headers.origin, options.allowedOrigins)) {
    return sendJson(request, response, options, 403, { error: 'forbidden-origin' });
  }
  const address = clientAddress(request, options.trustProxy);
  if (!options.createLimiter.allow(address, options.clock.now())) {
    return sendJson(request, response, options, 429, { error: 'rate-limited' });
  }

  const read = await readJson(request);
  if (!read.ok && read.reason === 'too-large') {
    // Answer, then drop the connection: the rest of the body is not wanted.
    response.on('finish', () => request.destroy());
    response.setHeader('connection', 'close');
    return sendJson(request, response, options, 413, { error: 'too-large' });
  }
  const body = read.ok ? read.value : undefined;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return sendJson(request, response, options, 400, { error: 'bad-request' });
  }
  const { gameId, rules, config } = body as Record<string, unknown>;
  if (typeof gameId !== 'string' || (rules !== undefined && typeof rules !== 'number')) {
    return sendJson(request, response, options, 400, { error: 'bad-request' });
  }

  const result = options.manager.create({
    gameId,
    ...(rules === undefined ? {} : { rules: rules as number }),
    config,
  });
  if (!result.ok) {
    const status =
      result.error === 'unknown-game' ? 404 : result.error === 'rules-mismatch' ? 409 : 503;
    return sendJson(request, response, options, status, { error: result.error });
  }
  sendJson(request, response, options, 201, {
    code: result.code,
    token: result.token,
    protocol: PROTOCOL_VERSION,
  });
}

async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpOptions,
): Promise<void> {
  const notFound = () => sendJson(request, response, options, 404, { error: 'not-found' });
  const root = options.clientDist;
  if (root === null) return notFound();

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    return sendJson(request, response, options, 400, { error: 'bad-request' });
  }
  if (pathname.includes('\0'))
    return sendJson(request, response, options, 400, { error: 'bad-request' });
  // Hidden files and folders are never served.
  if (pathname.split('/').some((segment) => segment.startsWith('.'))) return notFound();

  const base = path.resolve(root);
  let file = path.resolve(base, pathname === '/' ? 'index.html' : `.${pathname}`);
  if (file !== base && !file.startsWith(base + path.sep)) return notFound();

  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      file = path.join(file, 'index.html');
      info = await stat(file);
    }
    if (!info.isFile()) return notFound();

    const extension = path.extname(file).toLowerCase();
    const headers: Record<string, string | number> = {
      'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'content-length': info.size,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      // Built assets have names that change with their content; the page itself must always be fresh.
      'cache-control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    };
    if (extension === '.html') {
      headers['content-security-policy'] = CONTENT_SECURITY_POLICY;
      headers['x-frame-options'] = 'DENY';
    }
    response.writeHead(200, headers);
    if (request.method === 'HEAD') return void response.end();
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response);
  } catch {
    notFound();
  }
}

export function createRequestListener(
  options: HttpOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const run = async () => {
      const method = request.method ?? 'GET';
      const pathname = (request.url ?? '/').split('?')[0] ?? '/';

      if (pathname.startsWith('/api/')) {
        if (method === 'OPTIONS') {
          response.writeHead(204, {
            ...corsHeaders(request, options.allowedOrigins),
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': 'content-type',
            'access-control-max-age': '600',
          });
          return void response.end();
        }
        if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
          return sendJson(request, response, options, 200, {
            ok: true,
            rooms: options.manager.roomCount,
          });
        }
        if (pathname === '/api/catalog' && (method === 'GET' || method === 'HEAD')) {
          return sendJson(request, response, options, 200, {
            protocol: PROTOCOL_VERSION,
            limits: { maxDevices: LIMITS.maxDevices, maxNameLength: LIMITS.maxNameLength },
            games: options.catalog,
          });
        }
        if (pathname === '/api/rooms' && method === 'POST') {
          return handleCreateRoom(request, response, options);
        }
        return sendJson(request, response, options, 404, { error: 'not-found' });
      }

      if (method !== 'GET' && method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD' });
        return void response.end();
      }
      return serveStatic(request, response, options);
    };
    run().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  };
}
