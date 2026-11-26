import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  LIMITS,
  createRateLimiter,
  normalizeRoomCode,
  type RoomEnv,
  type ServerMessage,
} from '@game-library/room';
import { WebSocketServer, type WebSocket } from 'ws';
import { clientAddress, createRequestListener, originAllowed, type CatalogEntry } from './http.ts';
import { Counter, KeyedLimiter } from './limits.ts';
import { RoomManager, systemClock, type Clock } from './rooms.ts';

export interface ServerOptions {
  /** 0 picks a free port (tests). */
  readonly port: number;
  readonly host?: string;
  readonly env: RoomEnv;
  readonly catalog: readonly CatalogEntry[];
  readonly clientDist?: string | null;
  readonly allowedOrigins?: readonly string[] | null;
  readonly trustProxy?: boolean;
  readonly maxRooms?: number;
  readonly clock?: Clock;
  readonly log?: (line: string) => void;
  /** Limits, with sensible defaults; tests lower them. */
  readonly limits?: {
    readonly roomsPerAddressBurst?: number;
    readonly roomsPerAddressPerMinute?: number;
    readonly socketsPerAddress?: number;
    readonly unknownRoomsPerAddressBurst?: number;
    readonly messagesBurst?: number;
    readonly messagesPerSecond?: number;
  };
}

export interface RunningServer {
  readonly port: number;
  readonly manager: RoomManager;
  close(): Promise<void>;
}

const HEARTBEAT_MS = 30_000;
const MAX_STRIKES = 5;
const ROOM_PATH = /^\/api\/rooms\/([^/]+)\/ws$/;

function sendMessage(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/** Starts the HTTP server and the room WebSockets on one port. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const clock = options.clock ?? systemClock;
  const limits = options.limits ?? {};
  const allowedOrigins = options.allowedOrigins ?? null;
  const trustProxy = options.trustProxy ?? false;
  const log = options.log ?? (() => {});

  const manager = new RoomManager({
    env: options.env,
    clock,
    log,
    ...(options.maxRooms === undefined ? {} : { maxRooms: options.maxRooms }),
  });

  const createLimiter = new KeyedLimiter({
    capacity: limits.roomsPerAddressBurst ?? 10,
    refillPerSecond: (limits.roomsPerAddressPerMinute ?? 10) / 60,
  });
  const unknownRoomLimiter = new KeyedLimiter({
    capacity: limits.unknownRoomsPerAddressBurst ?? 20,
    refillPerSecond: 20 / 60,
  });
  const socketsPerAddress = new Counter();
  /** Whether a socket answered the last ping. */
  const alive = new WeakMap<WebSocket, boolean>();
  const maxSocketsPerAddress = limits.socketsPerAddress ?? 30;

  const server: Server = createServer(
    createRequestListener({
      manager,
      catalog: options.catalog,
      clientDist: options.clientDist ?? null,
      allowedOrigins,
      trustProxy,
      createLimiter,
      clock,
    }),
  );
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxMessageBytes });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const match = ROOM_PATH.exec((request.url ?? '').split('?')[0] ?? '');
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return void socket.destroy();
    }
    if (!originAllowed(request.headers.origin, allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return void socket.destroy();
    }
    const rawCode = decodeURIComponent(match[1] ?? '');
    wss.handleUpgrade(request, socket, head, (ws) => onConnection(ws, request, rawCode));
  });

  function onConnection(ws: WebSocket, request: IncomingMessage, rawCode: string): void {
    const address = clientAddress(request, trustProxy);
    const refuse = (code: 'room-not-found' | 'rate-limited', closeCode: number) => {
      sendMessage(ws, { type: 'error', code });
      ws.close(closeCode, code);
    };

    if (socketsPerAddress.get(address) >= maxSocketsPerAddress) return refuse('rate-limited', 4429);
    const code = normalizeRoomCode(rawCode);
    if (code === null || !manager.has(code)) {
      // Guessing codes is what an attacker would do: that is what is limited.
      return refuse(
        unknownRoomLimiter.allow(address, clock.now()) ? 'room-not-found' : 'rate-limited',
        4404,
      );
    }

    socketsPerAddress.increment(address);
    alive.set(ws, true);
    let strikes = 0;
    const messages = createRateLimiter({
      capacity: limits.messagesBurst ?? 30,
      refillPerSecond: limits.messagesPerSecond ?? 5,
    });

    const conn = manager.connect(code, {
      send: (text) => {
        if (ws.readyState === ws.OPEN) ws.send(text);
      },
      close: (reason) => ws.close(1000, reason.slice(0, 100)),
    });
    if (conn === null) {
      socketsPerAddress.decrement(address);
      return refuse('room-not-found', 4404);
    }

    const strike = () => {
      strikes += 1;
      if (strikes >= MAX_STRIKES) ws.close(1008, 'too-many-bad-messages');
    };

    ws.on('pong', () => alive.set(ws, true));

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        sendMessage(ws, { type: 'error', code: 'bad-message' });
        return strike();
      }
      if (!messages.allow(clock.now())) {
        sendMessage(ws, { type: 'error', code: 'rate-limited' });
        return strike();
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        sendMessage(ws, { type: 'error', code: 'bad-message' });
        return strike();
      }
      manager.message(code, conn, parsed);
    });

    ws.on('close', () => {
      socketsPerAddress.decrement(address);
      manager.disconnect(code, conn);
    });
    ws.on('error', () => ws.terminate());
  }

  // Phones lose connections without saying so: a socket that does not answer a ping is dropped.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host ?? '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    port,
    manager,
    async close() {
      clearInterval(heartbeat);
      manager.closeAll();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
