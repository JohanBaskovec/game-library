/** Letters and digits that cannot be mistaken for each other (no 0/O, 1/I). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 5;

/**
 * A new room code. `randomInt(n)` must return a uniformly random integer in [0, n) from a source the
 * host trusts: the room package draws no randomness itself.
 */
export function generateRoomCode(randomInt: (maxExclusive: number) => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length));
  }
  return code;
}

/** What a player typed, as a room code: spaces and dashes ignored, upper case. Null when it cannot be one. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const character of code) {
    if (!ROOM_CODE_ALPHABET.includes(character)) return null;
  }
  return code;
}
