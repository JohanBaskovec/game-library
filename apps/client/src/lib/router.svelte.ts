import { isValidGameId } from '@game-library/game-kit';
import { normalizeRoomCode } from '@game-library/room';

export type Route =
  | { readonly name: 'picker' }
  | { readonly name: 'settings' }
  | { readonly name: 'play'; readonly gameId: string }
  /** Creating a room for a game. */
  | { readonly name: 'room-new'; readonly gameId: string }
  /** A room, by its code (always in upper case). */
  | { readonly name: 'room'; readonly code: string };

/**
 * Turns a URL hash into a route. Unknown paths show the picker. Hash routes work the same on a
 * static host, under a sub-path and inside the native app, with no server-side rewriting.
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '');
  if (path === '/settings') return { name: 'settings' };
  const play = /^\/play\/([^/]+)$/.exec(path);
  const gameId = play?.[1];
  if (gameId !== undefined && isValidGameId(gameId)) return { name: 'play', gameId };

  const created = /^\/room\/new\/([^/]+)$/.exec(path)?.[1];
  if (created !== undefined && isValidGameId(created)) return { name: 'room-new', gameId: created };

  const room = /^\/room\/([^/]+)$/.exec(path)?.[1];
  const code = room === undefined ? null : normalizeRoomCode(room);
  if (code !== null) return { name: 'room', code };
  return { name: 'picker' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'settings':
      return '#/settings';
    case 'play':
      return `#/play/${route.gameId}`;
    case 'room-new':
      return `#/room/new/${route.gameId}`;
    case 'room':
      return `#/room/${route.code}`;
    default:
      return '#/';
  }
}

/** Goes to a screen, adding it to the browser history. */
export function navigate(route: Route): void {
  globalThis.location.hash = routeHref(route);
}

class Router {
  route = $state<Route>(parseRoute(globalThis.location?.hash ?? ''));

  constructor() {
    globalThis.addEventListener?.('hashchange', () => {
      this.route = parseRoute(globalThis.location.hash);
    });
  }
}

export const router = new Router();
