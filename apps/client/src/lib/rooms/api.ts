import { normalizeRoomCode } from '@game-library/room';
import type { ServerEndpoints } from '../server.ts';

export type CreateRoomError =
  | 'rate-limited'
  | 'too-many-rooms'
  | 'unknown-game'
  | 'rules-mismatch'
  | 'bad-request'
  /** The server could not be reached, or answered something unexpected. */
  | 'unavailable';

export type CreateRoomResult =
  | { readonly ok: true; readonly code: string; readonly token: string }
  | { readonly ok: false; readonly error: CreateRoomError };

const STATUS_ERRORS: Readonly<Record<number, CreateRoomError>> = {
  400: 'bad-request',
  404: 'unknown-game',
  409: 'rules-mismatch',
  413: 'bad-request',
  429: 'rate-limited',
  503: 'too-many-rooms',
};

/** Asks the server for a new room. The reply holds the code and the secret that makes this device the host. */
export async function createRoomRequest(
  endpoints: ServerEndpoints,
  request: { gameId: string; rules: number; config: unknown },
  fetchFunction: typeof fetch = fetch,
): Promise<CreateRoomResult> {
  let response: Response;
  try {
    response = await fetchFunction(`${endpoints.api}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }

  if (response.status !== 201) {
    return { ok: false, error: STATUS_ERRORS[response.status] ?? 'unavailable' };
  }
  try {
    const body = (await response.json()) as { code?: unknown; token?: unknown };
    const code = typeof body.code === 'string' ? normalizeRoomCode(body.code) : null;
    if (code === null || typeof body.token !== 'string' || body.token === '') {
      return { ok: false, error: 'unavailable' };
    }
    return { ok: true, code, token: body.token };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}
