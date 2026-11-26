import type { MemberView, RoomView } from '@game-library/room';
import type { MessageKey, MessageParams } from '../i18n/core.ts';
import { en } from '../i18n/en.ts';

/** What a seat is called: the game's own name for it (a team name), or "Seat 1" when it has none. */
export function seatLabel(
  room: Pick<RoomView, 'seatNames'>,
  seat: number,
  t: (key: MessageKey, params?: MessageParams) => string,
): string {
  return room.seatNames[seat] || t('lobby.seat.name', { n: seat + 1 });
}

/** Members of a seat, or of no seat for `null`, in the room's order. */
export function membersOf(room: Pick<RoomView, 'members'>, seat: number | null): MemberView[] {
  return room.members.filter((member) => member.seat === seat);
}

/** Can the game start? Every seat needs a device that is connected now. */
export function seatsReady(room: Pick<RoomView, 'members' | 'seatCount'>): boolean {
  for (let seat = 0; seat < room.seatCount; seat++) {
    if (!membersOf(room, seat).some((member) => member.connected)) return false;
  }
  return true;
}

/** The message for an error code from the server or the room, or a general one for a code that has none. */
export function roomErrorKey(code: string): MessageKey {
  const key = `room.error.${code}`;
  return Object.hasOwn(en, key) ? (key as MessageKey) : 'room.error.unknown';
}
