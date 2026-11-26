import {
  Client,
  closeAllClients,
  createRoom,
  defineHostConformance,
  post,
} from '@game-library/host-conformance';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startWranglerHost, type WranglerHost } from './wrangler-host.ts';

// The two hosts must behave the same: the shared suite, against the real Worker on Cloudflare's runtime. Every
// request comes from one address here, so the limits that protect a real site are lifted for it.
defineHostConformance({
  name: 'Cloudflare host (workerd)',
  pageContains: 'Conformance home',
  start: () =>
    startWranglerHost({
      ROOMS_PER_ADDRESS_BURST: '100000',
      ROOMS_PER_ADDRESS_PER_MINUTE: '100000',
      UNKNOWN_ROOMS_PER_ADDRESS_BURST: '100000',
      MESSAGES_BURST: '1000',
    }),
});

// What belongs to this host: the limits are kept by a Durable Object per address.
describe('Cloudflare host: limits kept by the address object', () => {
  let host: WranglerHost;

  beforeAll(async () => {
    host = await startWranglerHost({
      ROOMS_PER_ADDRESS_BURST: '3',
      ROOMS_PER_ADDRESS_PER_MINUTE: '1',
      UNKNOWN_ROOMS_PER_ADDRESS_BURST: '2',
    });
  }, 90_000);

  afterEach(() => closeAllClients());

  afterAll(async () => {
    closeAllClients();
    await host.stop();
  }, 30_000);

  it('refuses a fourth room in a row from one address, with a 429', async () => {
    for (let i = 0; i < 3; i++) await createRoom(host);
    expect(await post(host, { gameId: 'le-curseur' })).toMatchObject({
      status: 429,
      body: { error: 'rate-limited' },
    });
  });

  it('answers wrong room codes with room-not-found, then with rate-limited once it sees guessing', async () => {
    const answers: string[] = [];
    for (let i = 0; i < 4; i++) {
      const client = await Client.open(host, 'ZZZZZ');
      answers.push(String((await client.next('error')).code));
    }
    expect(answers).toEqual(['room-not-found', 'room-not-found', 'rate-limited', 'rate-limited']);
  });
});
