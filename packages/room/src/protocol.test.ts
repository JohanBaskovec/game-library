import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  normalizeRoomCode,
} from './code.ts';
import { parseClientMessage } from './protocol.ts';

describe('parseClientMessage', () => {
  it('accepts every message of the protocol', () => {
    expect(parseClientMessage({ type: 'join', protocol: 1, name: 'Ann' })).toEqual({
      type: 'join',
      protocol: 1,
      name: 'Ann',
    });
    expect(
      parseClientMessage({ type: 'join', protocol: 1, name: 'A', token: 't', rules: 2 }),
    ).toEqual({
      type: 'join',
      protocol: 1,
      name: 'A',
      token: 't',
      rules: 2,
    });
    expect(parseClientMessage({ type: 'seat', seat: 1 })).toEqual({ type: 'seat', seat: 1 });
    expect(parseClientMessage({ type: 'seat', seat: null })).toEqual({ type: 'seat', seat: null });
    expect(parseClientMessage({ type: 'config', config: { a: 1 } })).toEqual({
      type: 'config',
      config: { a: 1 },
    });
    expect(parseClientMessage({ type: 'action', action: 'x' })).toEqual({
      type: 'action',
      action: 'x',
    });
    for (const type of ['start', 'reset', 'leave'] as const) {
      expect(parseClientMessage({ type })).toEqual({ type });
    }
  });

  it('ignores extra fields', () => {
    expect(parseClientMessage({ type: 'start', admin: true })).toEqual({ type: 'start' });
  });

  it('refuses anything that is not a well-formed message', () => {
    const bad: unknown[] = [
      null,
      undefined,
      'start',
      42,
      [],
      {},
      { type: 'nope' },
      { type: 7 },
      { type: 'join' },
      { type: 'join', protocol: '1', name: 'A' },
      { type: 'join', protocol: 1, name: 5 },
      { type: 'join', protocol: 1, name: 'A', token: 3 },
      { type: 'join', protocol: 1, name: 'A', rules: 'x' },
      { type: 'seat' },
      { type: 'seat', seat: 1.5 },
      { type: 'seat', seat: '1' },
      { type: 'config' },
      { type: 'action' },
    ];
    for (const message of bad)
      expect(parseClientMessage(message), JSON.stringify(message)).toBeNull();
  });

  it('accepts an action whose content is null: the game decides', () => {
    expect(parseClientMessage({ type: 'action', action: null })).toEqual({
      type: 'action',
      action: null,
    });
  });
});

describe('room codes', () => {
  it('uses letters and digits that cannot be confused', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OI]/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });

  it('generates codes of the right length from the alphabet', () => {
    let next = 0;
    const code = generateRoomCode((max) => next++ % max);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const character of code) expect(ROOM_CODE_ALPHABET).toContain(character);
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
    expect(generateRoomCode((max) => max - 1)).toBe('99999'.replace(/9/g, '9'));
  });

  it('reads what a player typed', () => {
    expect(normalizeRoomCode('abcde')).toBe('ABCDE');
    expect(normalizeRoomCode(' ab-cd e ')).toBe('ABCDE');
    expect(normalizeRoomCode('K7M2P')).toBe('K7M2P');
  });

  it('refuses what cannot be a code', () => {
    for (const input of [
      '',
      'ABCD',
      'ABCDEF',
      'ABCD0',
      'ABCDO',
      'ABCD1',
      'ABCDI',
      'AB!DE',
      'ÀBCDE',
    ]) {
      expect(normalizeRoomCode(input), input).toBeNull();
    }
  });
});
