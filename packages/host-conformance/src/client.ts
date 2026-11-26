import { PROTOCOL_VERSION } from '@game-library/room';
import WebSocket from 'ws';

export type Json = Record<string, unknown>;

/** Where a host listens: the same host answers HTTP and WebSockets. */
export interface HostAddress {
  /** Base of the HTTP API, e.g. `http://127.0.0.1:8787`. */
  readonly http: string;
  /** Base of the WebSockets, e.g. `ws://127.0.0.1:8787`. */
  readonly ws: string;
}

export const CONFIG = { teamNames: ['Blue', 'Orange'], roundCount: 1, contentLocale: 'fr' };

const open: WebSocket[] = [];

/** Closes every socket the test opened. Call after each test. */
export function closeAllClients(): void {
  for (const socket of open.splice(0)) socket.terminate();
}

export async function post(host: HostAddress, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${host.http}/api/rooms`, {
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

export async function createRoom(host: HostAddress, config: unknown = CONFIG) {
  const result = await post(host, { gameId: 'le-curseur', config });
  if (result.status !== 201) throw new Error(`Could not create a room: HTTP ${result.status}`);
  return result.body as { code: string; token: string; protocol: number };
}

/** A device connected to a room over a real WebSocket. */
export class Client {
  readonly messages: Json[] = [];
  closed: { code: number; reason: string } | null = null;
  readonly ws: WebSocket;
  private readonly waiters: (() => void)[] = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    open.push(ws);
    ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()) as Json);
      this.waiters.splice(0).forEach((wake) => wake());
    });
    ws.on('close', (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }

  static async open(host: HostAddress, code: string, origin?: string): Promise<Client> {
    const ws = new WebSocket(`${host.ws}/api/rooms/${code}/ws`, {
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

  private async wait(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      setTimeout(resolve, 100);
    });
  }

  /** Resolves with the first message (already received, or yet to come) that satisfies `test`. */
  async until(test: (message: Json) => boolean, description = 'a message'): Promise<Json> {
    const deadline = Date.now() + 8000;
    for (;;) {
      const found = this.messages.find(test);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out waiting for ${description}. Received: ${JSON.stringify(this.messages).slice(0, 600)}`,
        );
      }
      await this.wait();
    }
  }

  async next(type: string): Promise<Json> {
    return this.until((message) => message.type === type, `a "${type}" message`);
  }

  async untilClosed(): Promise<{ code: number; reason: string }> {
    const deadline = Date.now() + 8000;
    while (this.closed === null) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for the socket to close');
      await this.wait();
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

export type RoomMessage = {
  room: {
    phase: string;
    gameId: string;
    rulesVersion: number;
    members: { name: string; seat: number | null; connected: boolean }[];
    you: { host: boolean; seat: number | null };
  };
};
export type ViewMessage = { seat: number; actingSeat: number; over: boolean; view: Json };

/** A room with a host in seat 0 and a guest in seat 1, joined and seated. */
export async function seatedRoom(host: HostAddress) {
  const room = await createRoom(host);
  const hostClient = await Client.open(host, room.code);
  hostClient.join('Ann', room.token);
  await hostClient.next('joined');
  const guest = await Client.open(host, room.code);
  guest.join('Bob');
  const guestJoined = await guest.next('joined');
  hostClient.send({ type: 'seat', seat: 0 });
  guest.send({ type: 'seat', seat: 1 });
  await hostClient.until(
    (m) =>
      m.type === 'room' && (m as unknown as RoomMessage).room.members.every((x) => x.seat !== null),
    'both seats taken',
  );
  return { room, host: hostClient, guest, guestToken: guestJoined.token as string };
}
