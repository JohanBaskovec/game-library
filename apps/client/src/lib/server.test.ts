import { describe, expect, it } from 'vitest';
import { buildEndpoints, roomLink, type Where } from './server.ts';

const site: Where = {
  protocol: 'https:',
  host: 'games.example',
  origin: 'https://games.example',
  pathname: '/',
};

describe('server endpoints', () => {
  it('use the same origin when the site is served by the server', () => {
    expect(buildEndpoints({}, site, false)).toEqual({
      api: '',
      ws: 'wss://games.example',
      publicUrl: 'https://games.example/',
    });
  });

  it('use a plain WebSocket on a plain HTTP site', () => {
    const local: Where = {
      protocol: 'http:',
      host: '192.168.1.5:8787',
      origin: 'http://192.168.1.5:8787',
      pathname: '/',
    };
    expect(buildEndpoints({}, local, false)?.ws).toBe('ws://192.168.1.5:8787');
  });

  it('keep a sub-path of the site in the public address', () => {
    const sub: Where = { ...site, pathname: '/library/' };
    expect(buildEndpoints({}, sub, false)?.publicUrl).toBe('https://games.example/library/');
  });

  it('use the configured server, with the matching WebSocket scheme and no trailing slash', () => {
    expect(buildEndpoints({ serverUrl: 'https://api.example///' }, site, false)).toEqual({
      api: 'https://api.example',
      ws: 'wss://api.example',
      publicUrl: 'https://api.example/',
    });
    expect(buildEndpoints({ serverUrl: 'http://10.0.0.2:8787' }, site, false)?.ws).toBe(
      'ws://10.0.0.2:8787',
    );
  });

  it('use the configured public address for links', () => {
    const endpoints = buildEndpoints(
      { serverUrl: 'https://api.example', publicUrl: 'https://play.example/' },
      site,
      true,
    );
    expect(endpoints?.publicUrl).toBe('https://play.example/');
  });

  it('are missing in the native app unless a server is configured', () => {
    const app: Where = {
      protocol: 'https:',
      host: 'localhost',
      origin: 'https://localhost',
      pathname: '/',
    };
    expect(buildEndpoints({}, app, true)).toBeNull();
    expect(buildEndpoints({ serverUrl: 'https://api.example' }, app, true)?.api).toBe(
      'https://api.example',
    );
  });

  it('ignore a configured address that is not http or https', () => {
    for (const serverUrl of ['ftp://x.example', 'not a url', '', 'javascript:alert(1)']) {
      expect(buildEndpoints({ serverUrl }, site, false)?.api, serverUrl).toBe('');
    }
  });

  it('make a link that opens the room', () => {
    const endpoints = buildEndpoints({}, site, false);
    expect(endpoints && roomLink(endpoints, 'K7M2P')).toBe('https://games.example/#/room/K7M2P');
  });
});
