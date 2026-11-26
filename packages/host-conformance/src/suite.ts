import { LIMITS, PROTOCOL_VERSION } from '@game-library/room';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  closeAllClients,
  createRoom,
  post,
  seatedRoom,
  type HostAddress,
  type Json,
  type RoomMessage,
  type ViewMessage,
} from './client.ts';

export interface RunningHost extends HostAddress {
  stop(): Promise<void>;
}

export interface HostConformance {
  /** Shown in the test names. */
  readonly name: string;
  /** Starts a host with Le Curseur and generous limits, on a free port. */
  start(): Promise<RunningHost>;
  /** Text that the host's home page must contain, if it serves one. */
  readonly pageContains?: string;
}

/**
 * What every host (Node.js, Cloudflare) must do the same way: the HTTP API, and the room WebSocket
 * protocol, checked with real sockets. A host passes this suite before it is called a host.
 */
export function defineHostConformance(options: HostConformance): void {
  describe(`${options.name}: the host contract`, () => {
    let host: RunningHost;

    beforeAll(async () => {
      host = await options.start();
    }, 90_000);

    afterAll(async () => {
      closeAllClients();
      await host.stop();
    }, 30_000);

    afterEach(() => closeAllClients());

    describe('the HTTP API', () => {
      it('says it is alive', async () => {
        const body = (await (await fetch(`${host.http}/api/health`)).json()) as Json;
        expect(body.ok).toBe(true);
      });

      it('lists the games with their versions, and the protocol it speaks', async () => {
        const catalog = (await (await fetch(`${host.http}/api/catalog`)).json()) as {
          protocol: number;
          limits: Json;
          games: { id: string; rulesVersion: number; seatCount: number }[];
        };
        expect(catalog.protocol).toBe(PROTOCOL_VERSION);
        expect(catalog.limits).toEqual({
          maxDevices: LIMITS.maxDevices,
          maxNameLength: LIMITS.maxNameLength,
        });
        expect(catalog.games).toContainEqual(
          expect.objectContaining({ id: 'le-curseur', rulesVersion: 1, seatCount: 2 }),
        );
      });

      it('creates a room: a code, the host’s secret and the protocol version', async () => {
        const { status, body } = await post(host, {
          gameId: 'le-curseur',
          rules: 1,
          config: { roundCount: 1 },
        });
        expect(status).toBe(201);
        expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
        expect(body.token).toMatch(/^[0-9a-f]{32}$/);
        expect(body.protocol).toBe(PROTOCOL_VERSION);
      });

      it('gives every room its own code and its own secret', async () => {
        const rooms = await Promise.all(Array.from({ length: 8 }, () => createRoom(host)));
        expect(new Set(rooms.map((room) => room.code)).size).toBe(8);
        expect(new Set(rooms.map((room) => room.token)).size).toBe(8);
      });

      it('refuses requests it cannot use, with the right status', async () => {
        expect((await post(host, 'not json')).status).toBe(400);
        expect((await post(host, [])).status).toBe(400);
        expect((await post(host, 'null')).status).toBe(400);
        expect((await post(host, {})).status).toBe(400);
        expect((await post(host, { gameId: 7 })).status).toBe(400);
        expect((await post(host, { gameId: 'le-curseur', rules: 'one' })).status).toBe(400);
        expect(await post(host, { gameId: 'nope' })).toMatchObject({
          status: 404,
          body: { error: 'unknown-game' },
        });
        expect(await post(host, { gameId: 'le-curseur', rules: 99 })).toMatchObject({
          status: 409,
          body: { error: 'rules-mismatch' },
        });
      });

      it('refuses a request body that is too large, with a 413', async () => {
        const result = await post(host, {
          gameId: 'le-curseur',
          config: { junk: 'x'.repeat(20_000) },
        });
        expect(result.status).toBe(413);
      });

      it('answers a browser’s preflight request', async () => {
        const preflight = await fetch(`${host.http}/api/rooms`, {
          method: 'OPTIONS',
          headers: { origin: 'https://localhost', 'access-control-request-method': 'POST' },
        });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
        expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
        expect(preflight.headers.get('access-control-allow-headers')).toContain('content-type');
      });

      it('allows any site to call it (there are no cookies to protect)', async () => {
        const response = await fetch(`${host.http}/api/health`, {
          headers: { origin: 'https://anywhere.example' },
        });
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
      });

      it('does not know other routes', async () => {
        expect((await fetch(`${host.http}/api/nothing`)).status).toBe(404);
        expect((await fetch(`${host.http}/api/rooms`)).status).toBe(404);
        expect((await fetch(`${host.http}/api/health`, { method: 'POST' })).status).toBe(404);
      });

      if (options.pageContains !== undefined) {
        it('serves the website', async () => {
          const response = await fetch(`${host.http}/`);
          expect(response.status).toBe(200);
          expect(await response.text()).toContain(options.pageContains);
        });
      }
    });

    describe('playing in a room over real sockets', () => {
      it('plays a whole game, each team seeing only what is its own', async () => {
        const { host: ann, guest } = await seatedRoom(host);
        ann.send({ type: 'start' });
        const annView = (await ann.next('view')) as unknown as ViewMessage;
        await guest.next('view');

        const annIsGiver = annView.actingSeat === 0;
        const giver = annIsGiver ? ann : guest;
        const guesser = annIsGiver ? guest : ann;

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

        giver.send({ type: 'action', action: { type: 'continue' } });
        expect((await giver.next('refused')).error).toBe('wrong-seat');
        guesser.send({ type: 'action', action: { type: 'continue' } });

        await giver.until(
          (m) => m.type === 'view' && (m as unknown as ViewMessage).view.turnNumber === 2,
          'the second turn',
        );
        guesser.send({ type: 'action', action: { type: 'clue', text: 'lemon' } });
        giver.send({ type: 'action', action: { type: 'guess', position: 20 } });
        guesser.send({ type: 'action', action: { type: 'continue' } });
        giver.send({ type: 'action', action: { type: 'continue' } });
        const over = (await ann.until(
          (m) => m.type === 'view' && (m as unknown as ViewMessage).over === true,
          'the end of the game',
        )) as unknown as ViewMessage;
        expect(over.view.phase).toBe('recap');
        expect(over.view.turns).toHaveLength(2);
        expect((ann.last('room') as unknown as RoomMessage).room.phase).toBe('finished');

        for (const client of [ann, guest]) {
          const everything = JSON.stringify(client.messages);
          expect(everything).not.toContain('"rng"');
          expect(everything).not.toContain('usedPairIndexes');
        }
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

      it('tells a device which game and rules version the room runs', async () => {
        const { host: ann } = await seatedRoom(host);
        const room = (await ann.next('room')) as unknown as RoomMessage;
        expect(room.room.gameId).toBe('le-curseur');
        expect(room.room.rulesVersion).toBe(1);
      });

      it('lets a device that lost its connection come back to its seat and its view', async () => {
        const { room, host: ann, guest, guestToken } = await seatedRoom(host);
        ann.send({ type: 'start' });
        await guest.next('view');

        guest.ws.terminate();
        await ann.until(
          (m) =>
            m.type === 'room' &&
            (m as unknown as RoomMessage).room.members.some(
              (x) => x.name === 'Bob' && !x.connected,
            ),
          'Bob going offline',
        );

        const back = await Client.open(host, room.code);
        back.join('Bob', guestToken);
        const roomMessage = (await back.next('room')) as unknown as RoomMessage;
        expect(roomMessage.room.you.seat).toBe(1);
        expect(roomMessage.room.phase).toBe('playing');
        expect(((await back.next('view')) as unknown as ViewMessage).seat).toBe(1);
      });

      it('hands the host role on when the host leaves', async () => {
        const { host: ann, guest } = await seatedRoom(host);
        ann.send({ type: 'leave' });
        expect((await ann.untilClosed()).reason).toBe('left');
        const room = (await guest.until(
          (m) => m.type === 'room' && (m as unknown as RoomMessage).room.you.host,
          'the host role',
        )) as unknown as RoomMessage;
        expect(room.room.members.map((member) => member.name)).toEqual(['Bob']);
      });

      it('closes the room when the last device leaves, and then it cannot be joined', async () => {
        const room = await createRoom(host);
        const ann = await Client.open(host, room.code);
        ann.join('Ann', room.token);
        await ann.next('joined');
        ann.send({ type: 'leave' });
        await ann.untilClosed();
        const late = await Client.open(host, room.code);
        expect((await late.next('error')).code).toBe('room-not-found');
        expect((await late.untilClosed()).code).toBe(4404);
      });

      it('accepts the code as the players type it', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code.toLowerCase());
        client.join('Ann', room.token);
        await client.next('joined');
      });

      it('only lets the host change the settings or start', async () => {
        const { guest } = await seatedRoom(host);
        guest.send({ type: 'config', config: { roundCount: 9 } });
        guest.send({ type: 'start' });
        // Each refusal can arrive in its own packet: wait for both.
        await guest.until(() => guest.all('error').length >= 2, 'two refusals');
        expect(guest.all('error').map((error) => error.code)).toEqual(['not-host', 'not-host']);
      });
    });

    describe('what the socket layer refuses', () => {
      it('tells a device when the room does not exist, and closes', async () => {
        for (const code of ['ZZZZZ', 'ab', '!!!!!']) {
          const client = await Client.open(host, code);
          expect((await client.next('error')).code).toBe('room-not-found');
          expect((await client.untilClosed()).code).toBe(4404);
        }
      });

      it('refuses a socket on any other path', async () => {
        await expect(
          (async () => {
            const { default: WebSocket } = await import('ws');
            await new Promise<void>((resolve, reject) => {
              const ws = new WebSocket(`${host.ws}/somewhere/else`);
              ws.once('open', () => {
                ws.terminate();
                resolve();
              });
              ws.once('unexpected-response', (_request, response) =>
                reject(new Error(`HTTP ${response.statusCode}`)),
              );
              ws.once('error', reject);
            });
          })(),
        ).rejects.toThrow(/HTTP 404|Unexpected server response: 404/);
      });

      it('answers bad messages, and closes the socket after five of them', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code);
        client.send('{ not json');
        expect((await client.next('error')).code).toBe('bad-message');
        for (let i = 0; i < 4; i++) client.send('nope');
        expect((await client.untilClosed()).code).toBe(1008);
      });

      it('refuses a message that is not what the protocol says', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code);
        client.join('Ann', room.token);
        await client.next('joined');
        client.send({ type: 'seat', seat: 'left' });
        client.send({ type: 'dance' });
        client.send({ type: 'seat', seat: 7 });
        await client.until((m) => m.type === 'error' && m.code === 'bad-seat', 'bad-seat');
        expect(client.all('error').map((error) => error.code)).toEqual([
          'bad-message',
          'bad-message',
          'bad-seat',
        ]);
      });

      it('refuses a binary message', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code);
        client.ws.send(Buffer.from([1, 2, 3]));
        expect((await client.next('error')).code).toBe('bad-message');
      });

      it('closes a socket that sends a message larger than the limit', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code);
        client.send(
          JSON.stringify({
            type: 'config',
            config: { junk: 'x'.repeat(LIMITS.maxMessageBytes + 100) },
          }),
        );
        expect((await client.untilClosed()).code).toBe(1009);
      });

      it('refuses another protocol version and closes', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code);
        client.send({ type: 'join', protocol: 99, name: 'Old' });
        expect((await client.next('error')).code).toBe('protocol-mismatch');
        expect((await client.untilClosed()).reason).toBe('protocol-mismatch');
      });

      it('refuses a device whose app has other rules for the game', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code);
        client.send({ type: 'join', protocol: PROTOCOL_VERSION, name: 'Old', rules: 99 });
        expect((await client.next('error')).code).toBe('rules-mismatch');
        expect((await client.untilClosed()).reason).toBe('rules-mismatch');
      });

      it('needs a name, and does not let a socket join twice', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code);
        client.send({ type: 'join', protocol: PROTOCOL_VERSION, name: '   ' });
        expect((await client.next('error')).code).toBe('bad-name');
        client.join('Ann', room.token);
        await client.next('joined');
        client.join('Again');
        await client.until((m) => m.type === 'error' && m.code === 'bad-message', 'bad-message');
      });

      it('refuses messages from a socket that has not said who it is', async () => {
        const room = await createRoom(host);
        const client = await Client.open(host, room.code);
        client.send({ type: 'seat', seat: 0 });
        expect((await client.next('error')).code).toBe('not-joined');
      });
    });
  });
}
