export type Route = { readonly name: 'picker' } | { readonly name: 'settings' };

/**
 * Turns a URL hash into a route. Unknown paths show the picker. Hash routes work the same on a
 * static host, under a sub-path and inside the native app, with no server-side rewriting.
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '');
  switch (path) {
    case '/settings':
      return { name: 'settings' };
    default:
      return { name: 'picker' };
  }
}

export function routeHref(route: Route): string {
  return route.name === 'settings' ? '#/settings' : '#/';
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
