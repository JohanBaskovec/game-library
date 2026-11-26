import { describe, expect, it } from 'vitest';
import { membersOf, roomErrorKey, seatLabel, seatsReady } from './labels.ts';

const t = (key: string, params?: Record<string, string | number>) =>
  key === 'lobby.seat.name' ? `Seat ${params?.n}` : key;

const member = (name: string, seat: number | null, connected = true) => ({
  id: name,
  name,
  seat,
  connected,
});

describe('seat labels', () => {
  it('are the game’s names, or a generic one when a name is empty or missing', () => {
    const room = { seatNames: ['Blue', ''] };
    expect(seatLabel(room, 0, t)).toBe('Blue');
    expect(seatLabel(room, 1, t)).toBe('Seat 2');
    expect(seatLabel(room, 2, t)).toBe('Seat 3');
  });
});

describe('members of a seat', () => {
  const room = { members: [member('A', 0), member('B', 1), member('C', 0), member('D', null)] };

  it('are listed in order, and those without a seat with null', () => {
    expect(membersOf(room, 0).map((m) => m.name)).toEqual(['A', 'C']);
    expect(membersOf(room, 1).map((m) => m.name)).toEqual(['B']);
    expect(membersOf(room, null).map((m) => m.name)).toEqual(['D']);
    expect(membersOf(room, 5)).toEqual([]);
  });
});

describe('seats ready', () => {
  it('needs a connected member in every seat', () => {
    const seatCount = 2;
    expect(seatsReady({ seatCount, members: [member('A', 0), member('B', 1)] })).toBe(true);
    expect(seatsReady({ seatCount, members: [member('A', 0)] })).toBe(false);
    expect(seatsReady({ seatCount, members: [member('A', 0), member('B', 1, false)] })).toBe(false);
    expect(
      seatsReady({ seatCount, members: [member('A', 0), member('B', 1, false), member('C', 1)] }),
    ).toBe(true);
    expect(seatsReady({ seatCount, members: [] })).toBe(false);
  });
});

describe('error messages', () => {
  it('exist for every error the server or the room can report', () => {
    const codes = [
      'rate-limited',
      'too-many-rooms',
      'unknown-game',
      'rules-mismatch',
      'bad-request',
      'unavailable',
      'room-not-found',
      'room-closed',
      'protocol-mismatch',
      'room-full',
      'bad-name',
    ];
    for (const code of codes) expect(roomErrorKey(code), code).toBe(`room.error.${code}`);
  });

  it('fall back to a general message, even for names that every object has', () => {
    for (const code of ['', 'nope', 'not-host', 'toString', 'constructor', '__proto__']) {
      expect(roomErrorKey(code), code).toBe('room.error.unknown');
    }
  });
});
