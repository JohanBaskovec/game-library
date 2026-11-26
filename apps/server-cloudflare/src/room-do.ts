import { DurableObject } from 'cloudflare:workers';
import { findLogic } from '@game-library/registry/logics';
import type { RoomState } from '@game-library/room';
import { numberFrom, type Env } from './env.ts';
import {
  RoomRuntime,
  type CreateOutcome,
  type RoomRequest,
  type RuntimeSocket,
  type RuntimeStorage,
} from './runtime.ts';

/** What stays with a WebSocket while the object sleeps. */
interface Attachment {
  readonly conn: string;
  readonly since: number;
}

const ROOM_KEY = 'room';

function isAttachment(value: unknown): value is Attachment {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Attachment).conn === 'string' &&
    typeof (value as Attachment).since === 'number'
  );
}

function hex(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * One room. Cloudflare creates the object the first time its name (the room code) is used and keeps it in one
 * place in the world, so every device of a room reaches the same object. All the rules are in `RoomRuntime`;
 * this class only connects it to Cloudflare's WebSockets, storage and alarms.
 */
export class RoomDO extends DurableObject<Env> {
  private readonly runtime: RoomRuntime;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const storage: RuntimeStorage = {
      load: () => ctx.storage.get(ROOM_KEY),
      save: (room: RoomState) => ctx.storage.put(ROOM_KEY, room),
      clear: () => ctx.storage.deleteAll(),
      setAlarm: async (at) => {
        if (at === null) await ctx.storage.deleteAlarm();
        else await ctx.storage.setAlarm(at);
      },
    };
    this.runtime = new RoomRuntime({
      env: { game: findLogic },
      storage,
      sockets: () => ctx.getWebSockets().flatMap((socket) => this.wrap(socket)),
      now: () => Date.now(),
      randomHex: hex,
      log: (line) => console.log(line),
      limits: { messagesBurst: numberFrom(env.MESSAGES_BURST, 30) },
    });
  }

  private wrap(socket: WebSocket): RuntimeSocket[] {
    const attachment: unknown = socket.deserializeAttachment();
    if (!isAttachment(attachment)) return [];
    return [
      {
        conn: attachment.conn,
        since: attachment.since,
        send: (text) => {
          try {
            socket.send(text);
          } catch {
            // The socket is already gone: its close event will follow.
          }
        },
        close: (code, reason) => {
          try {
            socket.close(code, reason);
          } catch {
            // Already closed.
          }
        },
      },
    ];
  }

  /** Makes the room (called by the Worker, through RPC). */
  create(request: RoomRequest): Promise<CreateOutcome> {
    return this.runtime.create(request);
  }

  /** A WebSocket upgrade for this room. A room that does not exist answers 404, and the Worker explains. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    if (!(await this.runtime.exists())) return new Response(null, { status: 404 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: Attachment = { conn: `c${hex(8)}`, since: Date.now() };
    // Accepted through the object, not the socket: that is what lets the object sleep while the socket stays open.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    const [socket] = this.wrap(server);
    if (socket) await this.runtime.connect(socket);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async socketOf(ws: WebSocket): Promise<RuntimeSocket | undefined> {
    return this.wrap(ws)[0];
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const socket = await this.socketOf(ws);
    if (socket) await this.runtime.message(socket, message);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const socket = await this.socketOf(ws);
    if (socket) await this.runtime.closed(socket);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    const socket = await this.socketOf(ws);
    if (socket) await this.runtime.closed(socket);
  }

  override async alarm(): Promise<void> {
    await this.runtime.alarm();
  }
}
