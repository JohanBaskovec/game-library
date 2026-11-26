import { describe, expect, it } from 'vitest';
import { catalogReply, createRoomReply, createRoomStatus, parseCreateRoomRequest } from './api.ts';
import { LIMITS, PROTOCOL_VERSION } from './protocol.ts';

describe('the create-room request', () => {
  it('accepts a game, with optional rules version and settings', () => {
    expect(parseCreateRoomRequest({ gameId: 'le-curseur' })).toEqual({ gameId: 'le-curseur' });
    expect(parseCreateRoomRequest({ gameId: 'g', rules: 2, config: { a: 1 } })).toEqual({
      gameId: 'g',
      rules: 2,
      config: { a: 1 },
    });
  });

  it('ignores fields it does not know', () => {
    expect(parseCreateRoomRequest({ gameId: 'g', admin: true })).toEqual({ gameId: 'g' });
  });

  it('refuses anything else', () => {
    for (const body of [
      null,
      undefined,
      'x',
      3,
      [],
      {},
      { gameId: 7 },
      { gameId: 'g', rules: '1' },
    ]) {
      expect(parseCreateRoomRequest(body), JSON.stringify(body)).toBeNull();
    }
  });
});

describe('statuses', () => {
  it('map each failure to its HTTP status, and anything unexpected to 503', () => {
    expect(createRoomStatus('bad-request')).toBe(400);
    expect(createRoomStatus('unknown-game')).toBe(404);
    expect(createRoomStatus('rules-mismatch')).toBe(409);
    expect(createRoomStatus('too-large')).toBe(413);
    expect(createRoomStatus('rate-limited')).toBe(429);
    expect(createRoomStatus('too-many-rooms')).toBe(503);
    expect(createRoomStatus('something-else')).toBe(503);
  });
});

describe('replies', () => {
  it('say which protocol this server speaks', () => {
    expect(createRoomReply('K7M2P', 'secret')).toEqual({
      code: 'K7M2P',
      token: 'secret',
      protocol: PROTOCOL_VERSION,
    });
    const games = [
      { id: 'g', rulesVersion: 1, seatCount: 2, singleDevice: true, contentLocales: ['fr'] },
    ];
    expect(catalogReply(games)).toEqual({
      protocol: PROTOCOL_VERSION,
      limits: { maxDevices: LIMITS.maxDevices, maxNameLength: LIMITS.maxNameLength },
      games,
    });
  });
});
