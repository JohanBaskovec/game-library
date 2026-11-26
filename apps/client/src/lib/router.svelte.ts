import { isValidGameId } from '@game-library/game-kit';

export type Route =
  | { readonly name: 'picker' }
  | { readonly name: 'settings' }
  | { readonly name: 'play'; readonly gameId: string };

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
  return { name: 'picker' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'settings':
      return '#/settings';
    case 'play':
      return `#/play/${route.gameId}`;
    default:
      return '#/';
  }
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
