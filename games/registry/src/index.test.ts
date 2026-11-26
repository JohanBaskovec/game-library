import { isValidGameId } from '@game-library/game-kit';
import { describe, expect, it } from 'vitest';
import { findGame, gameManifests } from './index.ts';
import { buildCatalog, findLogic, gameLogics } from './logics.ts';

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

  it('has the rules of every listed game, and no rules for a game that is not listed', () => {
    expect(Object.keys(gameLogics).sort()).toEqual(gameManifests.map((game) => game.id).sort());
    for (const game of gameManifests) {
      const logic = findLogic(game.id);
      expect(logic?.id).toBe(game.id);
      expect(logic?.seatCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not find rules by names that merely exist on every object', () => {
    for (const id of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(findLogic(id)).toBeUndefined();
    }
  });

  it('builds the catalog a server publishes: one entry per game, with the versions of its rules', () => {
    const catalog = buildCatalog();
    expect(catalog.map((entry) => entry.id).sort()).toEqual(
      gameManifests.map((game) => game.id).sort(),
    );
    for (const entry of catalog) {
      const logic = findLogic(entry.id);
      expect(entry.rulesVersion).toBe(logic?.rulesVersion);
      expect(entry.seatCount).toBe(logic?.seatCount);
    }
  });
});
