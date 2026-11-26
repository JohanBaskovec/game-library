import type { GameManifest } from '@game-library/game-kit';

/**
 * The list of games. Empty until Le Curseur is ported (milestone M2). Adding a game means creating
 * `games/<id>/` and adding one entry here; shell code never names a specific game.
 */
export const gameManifests: readonly GameManifest[] = [];

export function findGame(id: string): GameManifest | undefined {
  return gameManifests.find((game) => game.id === id);
}
