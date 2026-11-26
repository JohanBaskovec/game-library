import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from './router.svelte.ts';

describe('parseRoute', () => {
  it('shows the picker for an empty hash and the root', () => {
    for (const hash of ['', '#', '#/']) expect(parseRoute(hash)).toEqual({ name: 'picker' });
  });

  it('finds the settings screen, with or without a trailing slash', () => {
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/settings/')).toEqual({ name: 'settings' });
  });

  it('shows the picker for anything unknown', () => {
    for (const hash of ['#/nope', '#/settings/extra', '#settings', '#/Settings']) {
      expect(parseRoute(hash)).toEqual({ name: 'picker' });
    }
  });

  it('finds a game', () => {
    expect(parseRoute('#/play/le-curseur')).toEqual({ name: 'play', gameId: 'le-curseur' });
    expect(parseRoute('#/play/le-curseur/')).toEqual({ name: 'play', gameId: 'le-curseur' });
  });

  it('shows the picker for a game address that cannot be a game', () => {
    for (const hash of [
      '#/play',
      '#/play/',
      '#/play/Le-Curseur',
      '#/play/a/b',
      '#/play/-x',
      '#/play/a b',
    ]) {
      expect(parseRoute(hash)).toEqual({ name: 'picker' });
    }
  });

  it('builds links that parse back to the same route', () => {
    for (const route of [
      { name: 'picker' },
      { name: 'settings' },
      { name: 'play', gameId: 'forest-maze' },
    ] as const) {
      expect(parseRoute(routeHref(route))).toEqual(route);
    }
  });
});
