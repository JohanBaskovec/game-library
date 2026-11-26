import { Capacitor } from '@capacitor/core';

/** Where the app finds the server: the HTTP API, the WebSockets of rooms, and the site's public address. */
export interface ServerEndpoints {
  /** Base of the API: empty for the same origin, otherwise an absolute address without a trailing slash. */
  readonly api: string;
  /** Base of the room sockets: `ws://host` or `wss://host`. */
  readonly ws: string;
  /** Address players are given to open a room (a link, a QR code). */
  readonly publicUrl: string;
}

export interface ServerEnv {
  /** Address of the server, for a build that is not served by it (the native app). */
  readonly serverUrl?: string | undefined;
  /** Address of the public website, for the links people share. */
  readonly publicUrl?: string | undefined;
}

export interface Where {
  readonly protocol: string;
  readonly host: string;
  readonly origin: string;
  readonly pathname: string;
}

/** An http(s) address without its trailing slashes, or null when it is not one. */
function cleanUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Works out the server's endpoints. A website served by the server uses its own origin. The native app is
 * not served by the server, so it needs `VITE_SERVER_URL` at build time; without it rooms are unavailable
 * (null), and the app says so instead of trying to reach `https://localhost`.
 */
export function buildEndpoints(
  env: ServerEnv,
  where: Where,
  native: boolean,
): ServerEndpoints | null {
  const serverUrl = cleanUrl(env.serverUrl);
  const configuredPublic = cleanUrl(env.publicUrl);

  if (serverUrl) {
    return {
      api: serverUrl,
      ws: serverUrl.replace(/^http/, 'ws'),
      publicUrl: `${configuredPublic ?? serverUrl}/`,
    };
  }
  if (native) return null;

  return {
    api: '',
    ws: `${where.protocol === 'https:' ? 'wss:' : 'ws:'}//${where.host}`,
    publicUrl: configuredPublic ? `${configuredPublic}/` : `${where.origin}${where.pathname}`,
  };
}

/** The link that opens a room, to share by message or as a QR code. */
export function roomLink(endpoints: ServerEndpoints, code: string): string {
  return `${endpoints.publicUrl}#/room/${code}`;
}

export function currentEndpoints(): ServerEndpoints | null {
  return buildEndpoints(
    {
      serverUrl: import.meta.env.VITE_SERVER_URL,
      publicUrl: import.meta.env.VITE_PUBLIC_URL,
    },
    globalThis.location,
    Capacitor.isNativePlatform(),
  );
}
