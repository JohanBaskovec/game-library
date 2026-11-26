import { isValidGameId } from '@game-library/game-kit';
import { describe, expect, it } from 'vitest';
import { findGame, gameManifests } from './index.ts';

describe('game registry', () => {
  it('has unique, valid ids', () => {
    const ids = gameManifests.map((game) => game.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isValidGameId(id)).toBe(true);
  });

  it('declares at least one content language per game', () => {
    for (const game of gameManifests) expect(game.contentLocales.length).toBeGreaterThan(0);
  });

  it('finds a game by id and returns undefined for an unknown one', () => {
    expect(findGame('does-not-exist')).toBeUndefined();
    for (const game of gameManifests) expect(findGame(game.id)).toBe(game);
  });
});
