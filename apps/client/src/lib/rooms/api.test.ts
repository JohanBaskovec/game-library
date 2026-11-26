import { describe, expect, it, vi } from 'vitest';
import { createRoomRequest } from './api.ts';

const endpoints = {
  api: 'https://api.example',
  ws: 'wss://api.example',
  publicUrl: 'https://api.example/',
};
const request = { gameId: 'le-curseur', rules: 1, config: { a: 1 } };

function reply(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

describe('creating a room', () => {
  it('sends the game, its rules version and the settings, and returns the code and the secret', async () => {
    const fetchFunction = reply(201, { code: 'K7M2P', token: 'secret', protocol: 1 });
    const result = await createRoomRequest(endpoints, request, fetchFunction);
    expect(result).toEqual({ ok: true, code: 'K7M2P', token: 'secret' });
    const [url, init] = (fetchFunction as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.example/api/rooms');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it('uses the same origin when the endpoint is relative', async () => {
    const fetchFunction = reply(201, { code: 'K7M2P', token: 't', protocol: 1 });
    await createRoomRequest({ ...endpoints, api: '' }, request, fetchFunction);
    expect((fetchFunction as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('/api/rooms');
  });

  it.each([
    [400, 'bad-request'],
    [404, 'unknown-game'],
    [409, 'rules-mismatch'],
    [413, 'bad-request'],
    [429, 'rate-limited'],
    [503, 'too-many-rooms'],
    [500, 'unavailable'],
    [502, 'unavailable'],
  ])('maps status %s to "%s"', async (status, error) => {
    expect(await createRoomRequest(endpoints, request, reply(status, { error: 'x' }))).toEqual({
      ok: false,
      error,
    });
  });

  it('reports an unreachable server', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    expect(await createRoomRequest(endpoints, request, failing)).toEqual({
      ok: false,
      error: 'unavailable',
    });
  });

  it('refuses a reply that is not what the server sends', async () => {
    for (const body of [
      'not json',
      {},
      { code: 'K7M2P' },
      { token: 't' },
      { code: 'bad!', token: 't' },
      { code: 'K7M2P', token: '' },
    ]) {
      expect(
        await createRoomRequest(endpoints, request, reply(201, body)),
        JSON.stringify(body),
      ).toEqual({
        ok: false,
        error: 'unavailable',
      });
    }
  });

  it('refuses a server that speaks another version of the protocol, or does not say', async () => {
    for (const protocol of [{ protocol: 2 }, { protocol: 0 }, { protocol: '1' }, {}]) {
      expect(
        await createRoomRequest(
          endpoints,
          request,
          reply(201, { code: 'K7M2P', token: 't', ...protocol }),
        ),
      ).toEqual({ ok: false, error: 'protocol-mismatch' });
    }
  });
});
