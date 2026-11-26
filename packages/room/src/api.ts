import { LIMITS, PROTOCOL_VERSION } from './protocol.ts';

/**
 * The parts of the HTTP API that do not depend on a host: what a request must look like and which status
 * each failure gets. Both hosts use them, so a request means the same thing everywhere. (The shared package has
 * no DOM or Node types, so it works on plain data; each host reads the request and writes the response.)
 */

/** Largest request body a host reads, in bytes. */
export const MAX_REQUEST_BYTES = 8 * 1024;

export interface CreateRoomRequest {
  readonly gameId: string;
  readonly rules?: number;
  readonly config?: unknown;
}

/** Checks the body of `POST /api/rooms`. Null when it is not usable. */
export function parseCreateRoomRequest(body: unknown): CreateRoomRequest | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { gameId, rules, config } = body as Record<string, unknown>;
  if (typeof gameId !== 'string') return null;
  if (rules !== undefined && typeof rules !== 'number') return null;
  return {
    gameId,
    ...(rules === undefined ? {} : { rules: rules as number }),
    ...(config === undefined ? {} : { config }),
  };
}

/** The HTTP status of a failure to create a room. */
export function createRoomStatus(error: string): number {
  switch (error) {
    case 'bad-request':
      return 400;
    case 'unknown-game':
      return 404;
    case 'rules-mismatch':
      return 409;
    case 'too-large':
      return 413;
    case 'rate-limited':
      return 429;
    default:
      return 503; // 'too-many-rooms', or anything the host could not do
  }
}

/** The reply to a successful `POST /api/rooms`. */
export function createRoomReply(
  code: string,
  token: string,
): {
  readonly code: string;
  readonly token: string;
  readonly protocol: number;
} {
  return { code, token, protocol: PROTOCOL_VERSION };
}

export interface CatalogEntry {
  readonly id: string;
  readonly rulesVersion: number;
  readonly seatCount: number;
  readonly singleDevice: boolean;
  readonly contentLocales: readonly string[];
}

/** The reply to `GET /api/catalog`: which versions this server runs. */
export function catalogReply(games: readonly CatalogEntry[]): {
  readonly protocol: number;
  readonly limits: { readonly maxDevices: number; readonly maxNameLength: number };
  readonly games: readonly CatalogEntry[];
} {
  return {
    protocol: PROTOCOL_VERSION,
    limits: { maxDevices: LIMITS.maxDevices, maxNameLength: LIMITS.maxNameLength },
    games,
  };
}
